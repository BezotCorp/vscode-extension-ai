import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

export function findOpenDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
  const target = realPathOrSelf(uri.fsPath);

  return vscode.workspace.textDocuments.find(
    (document) => document.uri.scheme === 'file' && realPathOrSelf(document.uri.fsPath) === target,
  );
}

// Open documents with unsaved changes at, or below, the given path.
export function findDirtyDocuments(uri: vscode.Uri): vscode.TextDocument[] {
  const target = realPathOrSelf(uri.fsPath);

  return vscode.workspace.textDocuments.filter((document) => {
    if (document.uri.scheme !== 'file' || !document.isDirty) {
      return false;
    }

    const relative = path.relative(target, realPathOrSelf(document.uri.fsPath));

    return !relative.startsWith('..') && !path.isAbsolute(relative);
  });
}

function realPathOrSelf(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return target;
  }
}
