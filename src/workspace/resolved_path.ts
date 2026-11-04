import * as vscode from 'vscode';

import { StructuralWorkspace } from './structural_workspace';

export type ResolvedPath = {
  uri: vscode.Uri;
  insideCurrentWindow: boolean;
  // Current VS Code folder containing the target, when it is inside the window.
  currentWindowRoot?: string;
  // Recognised project/workspace containing both the current window and this target.
  // Detection grants no permission.
  structuralWorkspace?: StructuralWorkspace;
};
