import * as vscode from 'vscode';

export type ResolvedPath = {
  uri: vscode.Uri;
  insideCurrentWindow: boolean;
  // Real path of the workspace root, set when a workspace is open.
  workspaceRoot?: string;
};
