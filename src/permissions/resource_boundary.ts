import type { StructuralWorkspace } from '../workspace';

// Relationship between a filesystem resource and the folders explicitly opened in VS Code.
// This is classification only: structural workspace detection never grants access.
export type ResourceBoundary =
	| {
			kind: 'currentWindow';
			root: string;
	  }
	| {
			kind: 'structuralWorkspace';
			workspace: StructuralWorkspace;
	  }
	| {
			kind: 'external';
	  };
