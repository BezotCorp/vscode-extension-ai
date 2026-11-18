import type * as vscode from 'vscode';

import type { StructuralWorkspaceKind } from './structural_workspace_kind';

export type StructuralWorkspace = {
  kind: StructuralWorkspaceKind;
  root: vscode.Uri;
  marker: vscode.Uri;
};
