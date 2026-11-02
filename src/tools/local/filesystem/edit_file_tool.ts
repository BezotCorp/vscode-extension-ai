import * as vscode from 'vscode';

import { buildDiffLines, findUniqueMatch } from '../../../patch';
import { contentEffect } from '../../../permissions';
import { findDirtyDocuments, findOpenDocument, resolvePath } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { readStringArg } from '../../tool_input';
import { toolFailure, toolSuccess } from '../../tool_result';
import { unsavedChangesFailure } from './unsaved_changes_failure';

export class EditFileTool implements Tool {
  readonly id = 'edit_file';
  readonly name = 'Edit File';
  readonly readOnlyCompatible = false;
  readonly permissionDefault = 'ask' as const;
  readonly editsFiles = true;
  readonly description =
    'Replaces one exact piece of text in an existing file, leaving the rest untouched. old_text must match the file exactly (whitespace included) and appear once: include enough surrounding lines to make it unique. Read the file first. Prefer this over write_file for any change smaller than the whole file.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'File path, relative to the workspace root or absolute.' },
      old_text: { type: 'string', description: 'Exact text to replace. Must appear exactly once in the file.' },
      new_text: { type: 'string', description: 'Replacement text. An empty string deletes old_text.' },
    },
    required: ['path', 'old_text'],
  };

  constructor(private readonly accessGuard: ToolAccessGuard) {}

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const values = (input ?? {}) as { old_text?: unknown; new_text?: unknown };
    const oldText = values.old_text;
    const newText = values.new_text;

    if (typeof oldText !== 'string' || oldText === '') {
      return invalidArguments(this.id, 'Argument "old_text" must be a non-empty string.');
    }

    if (typeof newText !== 'string') {
      return invalidArguments(this.id, 'Argument "new_text" must be a string (use an empty string to delete).');
    }

    if (oldText === newText) {
      return toolFailure('error', this.id, undefined, {
        reason: 'no_change',
        message: 'old_text and new_text are identical; nothing to change.',
        executed: false,
        retryable: false,
      });
    }

    const resolved = resolvePath(readStringArg(input, 'path') ?? '');
    const fsPath = resolved.uri.fsPath;

    if (findDirtyDocuments(resolved.uri).length > 0) {
      return unsavedChangesFailure(this.id, fsPath);
    }

    // Matching the text tells the AI whether it is present, which is a way of reading the file.
    await this.accessGuard.assertReadable(this, resolved, false, { signal: context?.signal });

    const stat = await vscode.workspace.fs.stat(resolved.uri);

    if (stat.type & vscode.FileType.Directory) {
      return toolFailure('error', this.id, fsPath, {
        reason: 'is_a_directory',
        message: 'The path is a directory; nothing was changed.',
        executed: false,
        retryable: false,
      });
    }

    const loaded = await loadText(resolved.uri);

    if (loaded === undefined) {
      return toolFailure('error', this.id, fsPath, {
        reason: 'not_text',
        message: 'The file is not valid UTF-8 text, so it cannot be edited this way. Nothing was changed.',
        executed: false,
        retryable: false,
      });
    }

    const match = findUniqueMatch(loaded.text, oldText, newText);

    if (match.kind === 'missing') {
      return toolFailure('error', this.id, fsPath, {
        reason: 'old_text_not_found',
        message:
          'old_text was not found in the file. It must match exactly, including indentation and line breaks. Read the file again and copy the text as it is. Nothing was changed.',
        executed: false,
        retryable: true,
      });
    }

    if (match.kind === 'ambiguous') {
      return toolFailure('error', this.id, fsPath, {
        reason: 'ambiguous_match',
        message: `old_text appears ${match.count} times. Include more surrounding lines so it matches exactly once. Nothing was changed.`,
        executed: false,
        retryable: true,
        details: { occurrences: match.count },
      });
    }

    const line = loaded.text.slice(0, match.offset).split('\n').length;

    // The dialog shows the change itself, as a diff, once it is known to apply.
    await this.accessGuard.assertPath(this, 'write', resolved, false, {
      detail: `Line ${line}:\n${diffPreview(match.oldText, match.newText)}`,
      effects: [contentEffect(fsPath)],
      signal: context?.signal,
    });

    // The dialog can stay open for a long time: the file must still be exactly what was matched.
    const current = await loadText(resolved.uri);

    if (current === undefined || current.text !== loaded.text || findDirtyDocuments(resolved.uri).length > 0) {
      return toolFailure('error', this.id, fsPath, {
        reason: 'changed_during_confirmation',
        message: 'The file changed while waiting for the permission. Nothing was changed. Read it again.',
        executed: false,
        retryable: true,
      });
    }

    const document = current.document;
    const original = current.text;
    const details = {
      line,
      charactersRemoved: match.oldText.length,
      charactersAdded: match.newText.length,
    };

    if (document) {
      // The file is open and clean: edit through VS Code so the editor, undo history and disk stay consistent.
      const edit = new vscode.WorkspaceEdit();

      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(match.offset), document.positionAt(match.offset + match.oldText.length)),
        match.newText,
      );

      if (!(await vscode.workspace.applyEdit(edit))) {
        return toolFailure('error', this.id, fsPath, {
          reason: 'editor_refused_edit',
          message: 'VS Code refused to apply the edit. The file was not changed.',
          executed: false,
          retryable: true,
        });
      }

      if (!(await document.save())) {
        return toolFailure('error', this.id, fsPath, {
          reason: 'save_failed',
          message: 'File updated in the editor, but the changes could not be saved to disk.',
          executed: true,
          retryable: false,
          details: { ...details, via: 'editor', saved: false },
        });
      }

      return toolSuccess(this.id, fsPath, {
        message: 'Text replaced through the editor and saved.',
        details: { ...details, via: 'editor', saved: true },
      });
    }

    const updated =
      original.slice(0, match.offset) + match.newText + original.slice(match.offset + match.oldText.length);

    await vscode.workspace.fs.writeFile(resolved.uri, new TextEncoder().encode(updated));

    return toolSuccess(this.id, fsPath, {
      message: 'Text replaced on disk.',
      details: { ...details, via: 'disk' },
    });
  }
}

async function loadText(uri: vscode.Uri): Promise<{ text: string; document?: vscode.TextDocument } | undefined> {
  const document = findOpenDocument(uri);

  if (document) {
    return { text: document.getText(), document };
  }

  const text = decodeText(await vscode.workspace.fs.readFile(uri));

  return text === undefined ? undefined : { text };
}

function diffPreview(oldText: string, newText: string): string {
  return buildDiffLines(oldText, newText)
    .map((line) => `${line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '} ${line.content}`)
    .join('\n');
}

function decodeText(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function invalidArguments(operation: string, message: string): ToolExecutionResult {
  return toolFailure('error', operation, undefined, {
    reason: 'invalid_arguments',
    message,
    executed: false,
    retryable: true,
  });
}
