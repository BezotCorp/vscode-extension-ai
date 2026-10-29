import * as vscode from 'vscode';

import { findOpenDocument, resolvePath, truncateText } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { readNumberArg, readStringArg } from '../../tool_input';
import { toolFailure, toolSuccess } from '../../tool_result';

export class ReadFileTool implements Tool {
  readonly id = 'read_file';
  readonly name = 'Read File';
  readonly readOnlyCompatible = true;
  readonly description =
    'Reads a text file. Paths are relative to the workspace root; absolute paths outside it need user approval. If the file is open in the editor, the editor content (including unsaved changes) is returned. Optionally restrict to a 1-based inclusive line range.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'File path, relative to the workspace root or absolute.' },
      startLine: { type: 'number', description: 'First line to read (1-based).' },
      endLine: { type: 'number', description: 'Last line to read (inclusive).' },
    },
    required: ['path'],
  };

  constructor(private readonly accessGuard: ToolAccessGuard) {}

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const relativePath = readStringArg(input, 'path') ?? '';
    const resolved = resolvePath(relativePath);
    const fsPath = resolved.uri.fsPath;

    await this.accessGuard.assertReadable(resolved, false, { operation: this.id, signal: context?.signal });

    const document = findOpenDocument(resolved.uri);
    let text: string;

    if (document) {
      text = document.getText();
    } else {
      const bytes = await vscode.workspace.fs.readFile(resolved.uri);

      if (bytes.subarray(0, 8000).includes(0)) {
        return toolFailure('error', this.id, fsPath, {
          reason: 'binary_file',
          message: 'The file looks binary and was not read as text.',
          executed: false,
          retryable: false,
          details: { bytes: bytes.length },
        });
      }

      text = new TextDecoder().decode(bytes);
    }

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

    const truncated = truncateText(text);

    return toolSuccess(this.id, fsPath, {
      content: truncated.text,
      details: {
        source: document ? 'editor_buffer' : 'disk',
        unsavedChanges: document?.isDirty ?? false,
        totalLines: lines.length,
        truncated: truncated.truncated,
        ...(truncated.truncated && { originalLength: truncated.originalLength }),
      },
    });
  }
}
