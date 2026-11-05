import * as vscode from 'vscode';

import { StructuralWorkspaceKind } from './structural_workspace_kind';

export type StructuralWorkspace = {
  kind: StructuralWorkspaceKind;
  root: vscode.Uri;
  marker: vscode.Uri;
};
