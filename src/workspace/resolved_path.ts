import * as vscode from 'vscode';

import { StructuralWorkspace } from './structural_workspace';

export type ResolvedPath = {
  uri: vscode.Uri;
  insideCurrentWindow: boolean;
  currentWindowRoot?: vscode.Uri;
  structuralWorkspace?: StructuralWorkspace;
};

export function resourcePath(uri: vscode.Uri): string {
  return uri.scheme === 'file'
    ? uri.fsPath
    : uri.toString();
}
