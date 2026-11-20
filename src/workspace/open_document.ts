import * as path from 'node:path';
import * as vscode from 'vscode';

import { isParentRelative, realPathOrFallback } from './path_relations';

export function findOpenDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
  const target = realPathOrFallback(uri.fsPath, 'original');

  return vscode.workspace.textDocuments.find(
    (document) => document.uri.scheme === 'file' && realPathOrFallback(document.uri.fsPath, 'original') === target,
  );
}

// Open documents with unsaved changes at, or below, the given path.
export function findDirtyDocuments(uri: vscode.Uri): vscode.TextDocument[] {
  const target = realPathOrFallback(uri.fsPath, 'original');

  return vscode.workspace.textDocuments.filter((document) => {
    if (document.uri.scheme !== 'file' || !document.isDirty) {
      return false;
    }

    const relative = path.relative(target, realPathOrFallback(document.uri.fsPath, 'original'));

    return !isParentRelative(relative, 'native') && !path.isAbsolute(relative);
  });
}
