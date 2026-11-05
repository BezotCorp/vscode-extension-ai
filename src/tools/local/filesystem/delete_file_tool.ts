import * as vscode from 'vscode';

import { removalEffect } from '../../../permissions';
import { findDirtyDocuments, resolvePath, resourcePath } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { ACCESS_PARAMETER, readAccessArg, readStringArg } from '../../tool_input';
import { toolSuccess } from '../../tool_result';
import { unsavedChangesFailure } from './unsaved_changes_failure';
import { t } from '../../../i18n';

export class DeleteFileTool implements Tool {
  readonly id = 'delete_file';
  readonly name = 'Delete File';
  readonly readOnlyCompatible = false;
  readonly permissionDefault = 'ask' as const;
  readonly editsFiles = true;
  readonly description =
    'Moves a file or folder to the trash. Refused when it contains files with unsaved changes in the editor. Outside the current window the user is asked unless that resource has already been explicitly authorized; for a critical location (home folder or its parents, a folder of the current window or its parents, .git, system folders) give access critical with a reason.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path, relative to the workspace root or absolute.' },
      access: ACCESS_PARAMETER,
    },
    required: ['path'],
  };

  constructor(private readonly accessGuard: ToolAccessGuard) {}

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const resolved = await resolvePath(readStringArg(input, 'path') ?? '');
    const fsPath = resourcePath(resolved.uri);
    const stat = await vscode.workspace.fs.stat(resolved.uri);
    const isDirectory = Boolean(stat.type & vscode.FileType.Directory);

    if (findDirtyDocuments(resolved.uri).length > 0) {
      return unsavedChangesFailure(this.id, fsPath);
    }

    await this.accessGuard.assertPath(this, 'delete', resolved, isDirectory, {
      detail: isDirectory ? t('detail.folderToTrash') : undefined,
      effects: [removalEffect(fsPath)],
      access: readAccessArg(input),
      signal: context?.signal,
    });
    await vscode.workspace.fs.delete(resolved.uri, { recursive: isDirectory, useTrash: true });

    return toolSuccess(this.id, fsPath, {
      message: 'Moved to the trash.',
      details: { wasDirectory: isDirectory },
    });
  }
}
