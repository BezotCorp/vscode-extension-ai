import * as vscode from 'vscode';

import { findOpenDocument, ResolvedPath, resolvePath, resourcePath, sha256Hex } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { readNumberArg, readStringArg } from '../../tool_input';
import { toolFailure, toolSuccess } from '../../tool_result';
import { FileRead } from './file_read';
import { deliverFileContent } from './deliver_file_content';
import { FileVersionTracker } from './file_version_tracker';
import { READ_MODE_DIRECT, ReadMode } from './read_mode';

export class ReadFileTool implements Tool {
  readonly id = 'read_file';
  readonly name = 'Read File';
  readonly readOnlyCompatible = true;
  readonly permissionDefault = 'allow' as const;
  readonly description =
    'Reads a text file. Paths may be relative to the current window or absolute; paths outside the current window need user approval. If the file is open in the editor, the editor content (including unsaved changes) is returned. Optionally restrict to a 1-based inclusive line range.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'File path, relative to the current window or absolute.' },
      startLine: { type: 'number', description: 'First line to read (1-based).' },
      endLine: { type: 'number', description: 'Last line to read (inclusive).' },
    },
    required: ['path'],
  };

  constructor(
    private readonly accessGuard: ToolAccessGuard,
    private readonly versions: FileVersionTracker,
  ) {}

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const relativePath = readStringArg(input, 'path') ?? '';
    const resolved = await resolvePath(relativePath);
    const fsPath = resourcePath(resolved.uri);

    await this.accessGuard.assertReadable(this, resolved, false, { signal: context?.signal });

    let read: FileRead;

    try {
      read = await this.read(resolved, READ_MODE_DIRECT);
    } catch (error) {
      if (isNotFoundError(error)) {
        return toolFailure('error', this.id, fsPath, {
          reason: 'not_found',
          message:
            'The file was not found. Inspect the parent directory with list_files to verify the exact file name and casing before asking the user.',
          executed: false,
          retryable: true,
        });
      }

      if (isDirectoryError(error)) {
        return toolFailure('error', this.id, fsPath, {
          reason: 'is_a_directory',
          message: 'The requested path is a directory. Use list_files to inspect its contents.',
          executed: false,
          retryable: true,
        });
      }

      throw error;
    }

    if (read.binary) {
      return toolFailure('error', this.id, fsPath, {
        reason: 'binary_file',
        message: 'The file looks binary and was not read as text.',
        executed: false,
        retryable: false,
      });
    }

    let text = read.text;
    const lines = text.split('\n');
    const startLine = readNumberArg(input, 'startLine');
    const endLine = readNumberArg(input, 'endLine');

    if (startLine !== undefined || endLine !== undefined) {
      const from = Math.max((startLine ?? 1) - 1, 0);
      const to = endLine ?? lines.length;

      if (to < from + 1) {
        return toolFailure('error', this.id, fsPath, {
          reason: 'invalid_range',
          message: `Invalid line range ${startLine ?? 1}-${endLine ?? lines.length} (file has ${lines.length} lines).`,
          executed: false,
          retryable: true,
        });
      }

      text = lines.slice(from, to).join('\n');
    }

    // The content goes through every limit before anything is remembered: what the tracker keeps is what the model gets.
    const delivered = deliverFileContent(
      text,
      (truncated) =>
        toolSuccess(this.id, fsPath, {
          content: truncated.text,
          details: {
            source: read.source,
            unsavedChanges: read.unsavedChanges,
            totalLines: lines.length,
            truncated: truncated.truncated,
            ...(truncated.truncated && { originalLength: truncated.originalLength }),
          },
        }),
      context?.maxResultChars,
    );

    // A file with unsaved changes is not on the filesystem: nothing is remembered for it.
    if (!read.unsavedChanges) {
      this.versions.remember(fsPath, read.sha, delivered.received, delivered.received === read.text);
    }

    return delivered.result;
  }

  // Reads the file and computes the SHA of the bytes read (see ReadMode). Permissions are the caller's business.
  // A file open with unsaved changes is read from the editor, as the AI must see what the user sees; that
  // version is not on the filesystem, so nothing is remembered for it. What the AI receives is remembered by execute.
  async read(resolved: ResolvedPath, mode: ReadMode): Promise<FileRead> {
    const document = mode === READ_MODE_DIRECT ? findOpenDocument(resolved.uri) : undefined;
    const dirtyDocument = document?.isDirty ? document : undefined;
    const buffered = dirtyDocument !== undefined;
    const bytes = dirtyDocument
      ? new TextEncoder().encode(dirtyDocument.getText())
      : await vscode.workspace.fs.readFile(resolved.uri);
    const binary = bytes.subarray(0, 8000).includes(0);
    const sha = sha256Hex(bytes);

    return {
      text: binary ? '' : new TextDecoder().decode(bytes),
      bytes,
      sha,
      binary,
      source: buffered ? 'editor_buffer' : 'disk',
      unsavedChanges: buffered,
    };
  }
}

function isNotFoundError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;

  return code === 'ENOENT' || code === 'FileNotFound';
}

function isDirectoryError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;

  return code === 'EISDIR' || code === 'FileIsADirectory';
}
