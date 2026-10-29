import * as vscode from 'vscode';

import { contentEffect } from '../../../permissions';
import { findDirtyDocuments, findOpenDocument, resolvePath } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { describeContent, readStringArg } from '../../tool_input';
import { toolFailure, toolSuccess } from '../../tool_result';
import { unsavedChangesFailure } from './unsaved_changes_failure';

export class WriteFileTool implements Tool {
  readonly id = 'write_file';
  readonly name = 'Write File';
  readonly readOnlyCompatible = false;
  readonly description =
    'Replaces the whole content of an existing file. Use create_file for new files. Refused when the file has unsaved changes in the editor.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'File path, relative to the workspace root or absolute.' },
      content: { type: 'string', description: 'New full content of the file.' },
    },
    required: ['path', 'content'],
  };

  constructor(private readonly accessGuard: ToolAccessGuard) {}

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const content = (input as { content?: unknown } | null)?.content;

    if (typeof content !== 'string') {
      return toolFailure('error', this.id, undefined, {
        reason: 'invalid_arguments',
        message: 'Argument "content" must be a string.',
        executed: false,
        retryable: true,
      });
    }

    const resolved = resolvePath(readStringArg(input, 'path') ?? '');
    const fsPath = resolved.uri.fsPath;

    if (findDirtyDocuments(resolved.uri).length > 0) {
      return unsavedChangesFailure(this.id, fsPath);
    }

    await this.accessGuard.assertPath('write', resolved, false, {
      operation: this.id,
      detail: describeContent(content),
      effects: [contentEffect(fsPath)],
      signal: context?.signal,
    });

    const stat = await vscode.workspace.fs.stat(resolved.uri);

    if (stat.type & vscode.FileType.Directory) {
      return toolFailure('error', this.id, fsPath, {
        reason: 'is_a_directory',
        message: 'The path is a directory; nothing was written.',
        executed: false,
        retryable: false,
      });
    }

    const document = findOpenDocument(resolved.uri);

    if (document) {
      // The file is open and clean: edit through VS Code so the editor, undo history and disk stay consistent.
      const edit = new vscode.WorkspaceEdit();

      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
        content,
      );

      if (!(await vscode.workspace.applyEdit(edit))) {
        return toolFailure('error', this.id, fsPath, {
          reason: 'editor_refused_edit',
          message: 'VS Code refused to apply the edit. The file was not changed.',
          executed: false,
          retryable: true,
        });
      }

      const saved = await document.save();

      return toolSuccess(this.id, fsPath, {
        message: saved ? 'File updated through the editor and saved.' : 'File updated in the editor but could not be saved.',
        details: { via: 'editor', saved, characters: content.length },
      });
    }

    const bytes = new TextEncoder().encode(content);

    await vscode.workspace.fs.writeFile(resolved.uri, bytes);

    return toolSuccess(this.id, fsPath, {
      message: 'File replaced on disk.',
      details: { via: 'disk', bytesWritten: bytes.length },
    });
  }
}
