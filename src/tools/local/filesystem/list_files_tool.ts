import * as vscode from 'vscode';

import { resolvePath } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { readStringArg } from '../../tool_input';
import { toolSuccess } from '../../tool_result';

const MAX_ENTRIES = 200;
const IGNORED = new Set(['node_modules', 'out', '.git', '.vscode']);

export class ListFilesTool implements Tool {
  readonly id = 'list_files';
  readonly name = 'List Files';
  readonly readOnlyCompatible = true;
  readonly description =
    'Lists files and folders in a directory (folders end with "/"). Absolute paths outside the workspace need user approval.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Directory, relative to the workspace root or absolute. Defaults to the root.',
      },
    },
  };

  constructor(private readonly accessGuard: ToolAccessGuard) {}

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const resolved = resolvePath(readStringArg(input, 'path') ?? '.');

    await this.accessGuard.assertReadable(resolved, true, { operation: this.id, signal: context?.signal });

    const entries = (await vscode.workspace.fs.readDirectory(resolved.uri)).filter(([name]) => !IGNORED.has(name));
    const lines = entries
      .map(([name, type]) => (type & vscode.FileType.Directory ? `${name}/` : name))
      .sort()
      .slice(0, MAX_ENTRIES);

    return toolSuccess(this.id, resolved.uri.fsPath, {
      content: lines.join('\n') || '(empty directory)',
      details: { entries: lines.length, truncated: entries.length > MAX_ENTRIES, hiddenFolders: [...IGNORED] },
    });
  }
}
