import * as vscode from 'vscode';

import { findOpenDocument, resolvePath, WORKSPACE_EXCLUDE_GLOB } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { readStringArg } from '../../tool_input';
import { toolSuccess } from '../../tool_result';

const MAX_FILES = 500;
const MAX_MATCHES = 50;
const MAX_FILE_BYTES = 1_000_000;
const MAX_LINE_CHARS = 200;

export class SearchTextTool implements Tool {
  readonly id = 'search_text';
  readonly name = 'Search Text';
  readonly readOnlyCompatible = true;
  readonly description =
    'Searches the workspace for a case-insensitive text snippet and returns matching lines. Open editors are searched with their unsaved content.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Text to search for.' },
      glob: { type: 'string', description: 'Optional glob to restrict files, e.g. "src/**/*.ts".' },
    },
    required: ['query'],
  };

  constructor(private readonly accessGuard: ToolAccessGuard) {}

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const query = readStringArg(input, 'query') ?? '';

    await this.accessGuard.assertPath('search', resolvePath('.'), true, {
      operation: this.id,
      signal: context?.signal,
    });

    const glob = readStringArg(input, 'glob') ?? '**/*';
    const files = await vscode.workspace.findFiles(glob, WORKSPACE_EXCLUDE_GLOB, MAX_FILES);
    const needle = query.toLowerCase();
    const decoder = new TextDecoder();
    const matches: string[] = [];
    let skipped = 0;
    let fromEditors = 0;
    let scanned = 0;

    for (const file of files.sort((a, b) => a.fsPath.localeCompare(b.fsPath))) {
      if (matches.length >= MAX_MATCHES || context?.signal?.aborted) {
        break;
      }

      const document = findOpenDocument(file);
      let text: string;

      if (document) {
        text = document.getText();
        fromEditors++;
      } else {
        const bytes = await vscode.workspace.fs.readFile(file);

        if (bytes.length > MAX_FILE_BYTES || bytes.includes(0)) {
          skipped++;
          continue;
        }

        text = decoder.decode(bytes);
      }

      scanned++;

      const relative = vscode.workspace.asRelativePath(file, false);

      text.split('\n').forEach((line, index) => {
        if (matches.length < MAX_MATCHES && line.toLowerCase().includes(needle)) {
          matches.push(`${relative}:${index + 1}: ${line.trim().slice(0, MAX_LINE_CHARS)}`);
        }
      });
    }

    return toolSuccess(this.id, query, {
      content: matches.join('\n') || 'No matches found.',
      details: {
        matches: matches.length,
        matchLimitReached: matches.length >= MAX_MATCHES,
        filesScanned: scanned,
        filesSkippedBinaryOrLarge: skipped,
        filesFromEditorBuffers: fromEditors,
        fileLimitReached: files.length >= MAX_FILES,
      },
    });
  }
}
