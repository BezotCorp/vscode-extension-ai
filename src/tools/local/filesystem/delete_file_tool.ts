import * as vscode from 'vscode';

import { removalEffect } from '../../../permissions';
import { findDirtyDocuments, resolvePath } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { readStringArg } from '../../tool_input';
import { toolSuccess } from '../../tool_result';
import { unsavedChangesFailure } from './unsaved_changes_failure';

export class DeleteFileTool implements Tool {
  readonly id = 'delete_file';
  readonly name = 'Delete File';
  readonly readOnlyCompatible = false;
  readonly description =
    'Moves a file or folder to the trash. Refused when it contains files with unsaved changes in the editor.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path, relative to the workspace root or absolute.' },
    },
    required: ['path'],
  };

  constructor(private readonly accessGuard: ToolAccessGuard) {}

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const resolved = resolvePath(readStringArg(input, 'path') ?? '');
    const fsPath = resolved.uri.fsPath;
    const stat = await vscode.workspace.fs.stat(resolved.uri);
    const isDirectory = Boolean(stat.type & vscode.FileType.Directory);

    if (findDirtyDocuments(resolved.uri).length > 0) {
      return unsavedChangesFailure(this.id, fsPath);
    }

    await this.accessGuard.assertPath('delete', resolved, isDirectory, {
      operation: this.id,
      effects: [removalEffect(fsPath)],
      signal: context?.signal,
    });
    await vscode.workspace.fs.delete(resolved.uri, { recursive: isDirectory, useTrash: true });

    return toolSuccess(this.id, fsPath, {
      message: 'Moved to the trash.',
      details: { wasDirectory: isDirectory },
    });
  }
}
