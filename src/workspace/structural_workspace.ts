import {
  StructuralWorkspaceKind,
} from './structural_workspace_kind';

export type StructuralWorkspace = {
  kind: StructuralWorkspaceKind;
  root: string;
  marker: string;
};
