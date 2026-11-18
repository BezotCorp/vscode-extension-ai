import * as vscode from 'vscode';

import { contentEffect, removalEffect } from '../../../permissions';
import { findDirtyDocuments, resolvePath, resourcePath } from '../../../workspace';
import type { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { ACCESS_PARAMETER } from '../../access_parameter';
import { readAccessArg, readStringArg } from '../../tool_input';
import { toolSuccess } from '../../tool_result';
import { findProtectedTreeEntry } from './protected_tree_entry';
import { unsavedChangesFailure } from './unsaved_changes_failure';

export class MoveFileTool implements Tool {
  readonly id = 'move_file';
  readonly name = 'Move File';
  readonly readOnlyCompatible = false;
  readonly permissionDefault = 'ask' as const;
  readonly editsFiles = true;
  readonly description =
    'Moves or renames a file or folder. Fails if the destination already exists or the source has unsaved changes in the editor. Outside the current window the user is asked unless that resource has already been explicitly authorized; for a critical location (home folder or its parents, a folder of the current window or its parents, .git, system folders) give access critical with a reason.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      from: {
        type: 'string',
        description: 'Source path, relative to the workspace root or absolute.',
      },
      to: {
        type: 'string',
        description: 'Destination path, relative to the workspace root or absolute.',
      },
      access: ACCESS_PARAMETER,
    },
    required: ['from', 'to'],
  };

  constructor(private readonly accessGuard: ToolAccessGuard) {}

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const [source, destination] = await Promise.all([
      resolvePath(readStringArg(input, 'from') ?? ''),
      resolvePath(readStringArg(input, 'to') ?? ''),
    ]);

    const sourcePath = resourcePath(source.uri);
    const destinationPath = resourcePath(destination.uri);
    const resource = `${sourcePath} -> ${destinationPath}`;
    const stat = await vscode.workspace.fs.stat(source.uri);
    const isDirectory = Boolean(stat.type & vscode.FileType.Directory);

    if (findDirtyDocuments(source.uri).length > 0) {
      return unsavedChangesFailure(this.id, resource);
    }

    const protectedEntry =
      isDirectory && !this.accessGuard.isProtected(sourcePath) && !this.accessGuard.isProtected(destinationPath)
        ? await findProtectedTreeEntry(
            source.uri,
            (path) => this.accessGuard.isProtected(path),
            context?.signal,
            destination.uri,
          )
        : undefined;

    await this.accessGuard.assertMove(this, source, destination, isDirectory, {
      effects: [removalEffect(sourcePath), contentEffect(destinationPath)],
      protectedDescendant: protectedEntry
        ? resourcePath(protectedEntry.destination ?? protectedEntry.source)
        : undefined,
      access: readAccessArg(input),
      signal: context?.signal,
    });
    await vscode.workspace.fs.rename(source.uri, destination.uri, {
      overwrite: false,
    });

    return toolSuccess(this.id, resource, {
      message: 'Moved.',
      details: { wasDirectory: isDirectory },
    });
  }
}
