import * as vscode from 'vscode';

import { contentEffect, removalEffect } from '../../../permissions';
import { findDirtyDocuments, resolvePath } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { ACCESS_PARAMETER, readAccessArg, readStringArg } from '../../tool_input';
import { toolSuccess } from '../../tool_result';
import { unsavedChangesFailure } from './unsaved_changes_failure';

export class MoveFileTool implements Tool {
  readonly id = 'move_file';
  readonly name = 'Move File';
  readonly readOnlyCompatible = false;
  readonly permissionDefault = 'ask' as const;
  readonly editsFiles = true;
  readonly description =
    'Moves or renames a file or folder. Fails if the destination already exists or the source has unsaved changes in the editor. Outside the current window the user is always asked (access elevated); for a critical location (home folder or its parents, a folder of the current window or its parents, .git, system folders) give access critical with a reason.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      from: { type: 'string', description: 'Source path, relative to the workspace root or absolute.' },
      to: { type: 'string', description: 'Destination path, relative to the workspace root or absolute.' },
      access: ACCESS_PARAMETER,
    },
    required: ['from', 'to'],
  };

  constructor(private readonly accessGuard: ToolAccessGuard) {}

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const source = resolvePath(readStringArg(input, 'from') ?? '');
    const destination = resolvePath(readStringArg(input, 'to') ?? '');
    const resource = `${source.uri.fsPath} -> ${destination.uri.fsPath}`;
    const stat = await vscode.workspace.fs.stat(source.uri);
    const isDirectory = Boolean(stat.type & vscode.FileType.Directory);

    if (findDirtyDocuments(source.uri).length > 0) {
      return unsavedChangesFailure(this.id, resource);
    }

    await this.accessGuard.assertMove(this, source, destination, isDirectory, {
      effects: [removalEffect(source.uri.fsPath), contentEffect(destination.uri.fsPath)],
      access: readAccessArg(input),
      signal: context?.signal,
    });
    await vscode.workspace.fs.rename(source.uri, destination.uri, { overwrite: false });

    return toolSuccess(this.id, resource, { message: 'Moved.', details: { wasDirectory: isDirectory } });
  }
}
