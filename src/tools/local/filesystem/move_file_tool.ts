import * as vscode from 'vscode';

import { contentEffect, removalEffect } from '../../../permissions';
import { describeProtectedPath, findDirtyDocuments, resolvePath } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { readStringArg } from '../../tool_input';
import { toolSuccess } from '../../tool_result';
import { protectedPathFailure } from './protected_path_failure';
import { unsavedChangesFailure } from './unsaved_changes_failure';

export class MoveFileTool implements Tool {
  readonly id = 'move_file';
  readonly name = 'Move File';
  readonly readOnlyCompatible = false;
  readonly permissionDefault = 'ask' as const;
  readonly editsFiles = true;
  readonly description =
    'Moves or renames a file or folder. Fails if the destination already exists or the source has unsaved changes in the editor.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      from: { type: 'string', description: 'Source path, relative to the workspace root or absolute.' },
      to: { type: 'string', description: 'Destination path, relative to the workspace root or absolute.' },
    },
    required: ['from', 'to'],
  };

  constructor(private readonly accessGuard: ToolAccessGuard) {}

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const source = resolvePath(readStringArg(input, 'from') ?? '');
    const destination = resolvePath(readStringArg(input, 'to') ?? '');
    const resource = `${source.uri.fsPath} -> ${destination.uri.fsPath}`;
    const protectedPath = describeProtectedPath(source) ?? describeProtectedPath(destination);

    if (protectedPath) {
      return protectedPathFailure(this.id, resource, protectedPath);
    }

    const stat = await vscode.workspace.fs.stat(source.uri);
    const isDirectory = Boolean(stat.type & vscode.FileType.Directory);

    if (findDirtyDocuments(source.uri).length > 0) {
      return unsavedChangesFailure(this.id, resource);
    }

    await this.accessGuard.assertMove(this, source, destination, isDirectory, {
      effects: [removalEffect(source.uri.fsPath), contentEffect(destination.uri.fsPath)],
      signal: context?.signal,
    });
    await vscode.workspace.fs.rename(source.uri, destination.uri, { overwrite: false });

    return toolSuccess(this.id, resource, { message: 'Moved.', details: { wasDirectory: isDirectory } });
  }
}
