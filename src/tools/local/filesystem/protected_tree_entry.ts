import * as vscode from 'vscode';

import { resourcePath } from '../../../workspace';

export type ProtectedTreeEntry = {
	source: vscode.Uri;
	destination?: vscode.Uri;
	isDirectory: boolean;
};

// Finds the first descendant whose source path or corresponding destination
// path is protected. Symbolic-link directories are not traversed because a
// recursive filesystem operation affects the link itself, not its target tree.
export async function findProtectedTreeEntry(
	sourceRoot: vscode.Uri,
	isProtected: (path: string) => boolean,
	signal?: AbortSignal,
	destinationRoot?: vscode.Uri,
): Promise<ProtectedTreeEntry | undefined> {
	for (const [name, type] of await vscode.workspace.fs.readDirectory(sourceRoot)) {
		if (signal?.aborted) {
			throw new Error('Generation aborted');
		}

		const source = vscode.Uri.joinPath(sourceRoot, name);
		const destination = destinationRoot ? vscode.Uri.joinPath(destinationRoot, name) : undefined;
		const isDirectory = Boolean(type & vscode.FileType.Directory);

		if (isProtected(resourcePath(source)) || (destination !== undefined && isProtected(resourcePath(destination)))) {
			return {
				source,
				destination,
				isDirectory,
			};
		}

		if (isDirectory && !(type & vscode.FileType.SymbolicLink)) {
			const nested = await findProtectedTreeEntry(source, isProtected, signal, destination);

			if (nested) {
				return nested;
			}
		}
	}

	return undefined;
}
