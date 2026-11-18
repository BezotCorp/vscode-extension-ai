import * as vscode from 'vscode';
import { PermissionError } from '../../../permissions';
import { resolvePath, resourcePath, WORKSPACE_EXCLUDE_GLOB } from '../../../workspace';
import type { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { readStringArg } from '../../tool_input';
import { toolFailure, toolSuccess } from '../../tool_result';
import type { FileRead } from './file_read';
import type { ReadFileTool } from './read_file_tool';
import { READ_MODE_SEARCH } from './read_mode_values';
import { MAX_FILE_BYTES, MAX_FILES, MAX_LINE_CHARS, MAX_MATCHES } from './search_text_limits';

export class SearchTextTool implements Tool {
  readonly id = 'search_text';
  readonly name = 'Search Text';
  readonly readOnlyCompatible = true;
  readonly permissionDefault = 'allow' as const;
  readonly description =
    'Searches the workspace for a case-insensitive text snippet and returns matching lines. Open editors are searched with their unsaved content. Sensitive files such as .env are not skipped: their content goes through the same current permission check as read_file, including fresh confirmation when protection requires it. Generated directories such as node_modules and target are skipped unless you pass {"includeIgnored":true}.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Text to search for.' },
      glob: {
        type: 'string',
        description: 'Optional glob to restrict files, e.g. "src/**/*.ts".',
      },
      includeIgnored: {
        type: 'boolean',
        description:
          'Set to true to also search the generated or vendored directories skipped by default (node_modules, target, dist, out, build, .git...).',
      },
    },
    required: ['query'],
  };

  constructor(
    private readonly accessGuard: ToolAccessGuard,
    private readonly reader: ReadFileTool,
  ) {}

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const query = readStringArg(input, 'query') ?? '';

    if (!query) {
      return toolFailure('error', this.id, undefined, {
        reason: 'invalid_arguments',
        message: 'Argument "query" must contain text to search for.',
        executed: false,
        retryable: true,
      });
    }

    await this.accessGuard.assertPath(this, 'search', await resolvePath('.'), true, {
      signal: context?.signal,
    });

    const glob = readStringArg(input, 'glob') ?? '**/*';
    const includeIgnored = (input as { includeIgnored?: unknown } | null)?.includeIgnored === true;
    const files = await vscode.workspace.findFiles(
      glob,
      includeIgnored ? undefined : WORKSPACE_EXCLUDE_GLOB,
      MAX_FILES,
    );
    const needle = query.toLowerCase();
    const matches: string[] = [];
    const refused: string[] = [];
    let skipped = 0;
    let fromEditors = 0;
    let scanned = 0;

    for (const file of files.sort((a, b) => resourcePath(a).localeCompare(resourcePath(b)))) {
      if (matches.length >= MAX_MATCHES || context?.signal?.aborted) {
        break;
      }

      let read: FileRead;

      try {
        const stat = await vscode.workspace.fs.stat(file);

        if (!(stat.type & vscode.FileType.File) || stat.size > MAX_FILE_BYTES) {
          skipped++;
          continue;
        }

        // The content is acquired through read_file so every actual file-content read uses the same low-level path.
        // ToolAccessGuard remains the authority for permissions, boundaries and protected-resource decisions.
        // This tool only searches the text it gets back.
        read = await this.reader.read(this, await resolvePath(resourcePath(file)), READ_MODE_SEARCH, context?.signal);
      } catch (error) {
        if (error instanceof PermissionError) {
          if (error.kind === 'user_refused') {
            refused.push(vscode.workspace.asRelativePath(file, false));
            continue;
          }

          throw error;
        }

        // A file that vanished or cannot be read must not abort the whole search.
        skipped++;
        continue;
      }

      if (read.binary || read.bytes.length > MAX_FILE_BYTES) {
        skipped++;
        continue;
      }

      scanned++;

      if (read.source === 'editor_buffer') {
        fromEditors++;
      }

      const relative = vscode.workspace.asRelativePath(file, false);

      read.text.split('\n').forEach((line, index) => {
        if (matches.length < MAX_MATCHES && line.toLowerCase().includes(needle)) {
          matches.push(`${relative}:${index + 1}: ${line.trim().slice(0, MAX_LINE_CHARS)}`);
        }
      });
    }

    if (context?.signal?.aborted) {
      return toolFailure('cancelled', this.id, query, {
        reason: 'cancelled_by_user',
        message: 'The search was cancelled; no result is reported because it would be incomplete.',
        executed: false,
        retryable: true,
      });
    }

    return toolSuccess(this.id, query, {
      content: [
        matches.join('\n') || 'No matches found.',
        refused.length > 0
          ? `${refused.length} file(s) were NOT searched because the user refused to let them be read: ${refused.slice(0, 20).join(', ')}. Do not try to reach their content another way; tell the user if it matters.`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n'),
      details: {
        matches: matches.length,
        matchLimitReached: matches.length >= MAX_MATCHES,
        filesScanned: scanned,
        filesSkippedBinaryLargeOrUnreadable: skipped,
        filesRefusedByUser: refused.length,
        filesFromEditorBuffers: fromEditors,
        fileLimitReached: files.length >= MAX_FILES,
        includeIgnored,
      },
    });
  }
}
