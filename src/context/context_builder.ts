import * as vscode from 'vscode';

import { isProtectedResource } from '../permissions';
import { truncateContent } from '../workspace';
import { AiContext, ContextFile } from '.';

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

  return isHidden(editor.document.uri.fsPath) ? undefined : documentToContextFile(editor.document);
}

function documentToContextFile(document: vscode.TextDocument): ContextFile {
  return {
    path: document.uri.fsPath,
    languageId: document.languageId,
    content: truncateContent(document.getText()),
  };
}

function isHidden(fsPath: string): boolean {
  return isProtectedResource(fsPath) !== undefined;
}
