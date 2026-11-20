import * as vscode from 'vscode';

import { isProtectedResource } from '../permissions';
import { truncateContent } from '../workspace';
import type { AiContext, ContextFile } from '.';

export async function buildAiContext(): Promise<AiContext> {
  return {
    editor: {
      activeFile: getActiveFile(),
    },
  };
}

function getActiveFile(): ContextFile | undefined {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.isUntitled || editor.document.uri.scheme !== 'file') {
    return undefined;
  }

  // A protected file is still the active file: its path is visible, its content needs the user's authorization.
  return isProtected(editor.document.uri.fsPath)
    ? { path: editor.document.uri.fsPath, languageId: editor.document.languageId, withheld: 'protected' }
    : documentToContextFile(editor.document);
}

function documentToContextFile(document: vscode.TextDocument): ContextFile {
  return {
    path: document.uri.fsPath,
    languageId: document.languageId,
    content: truncateContent(document.getText()),
  };
}

function isProtected(fsPath: string): boolean {
  return isProtectedResource(fsPath) !== undefined;
}
