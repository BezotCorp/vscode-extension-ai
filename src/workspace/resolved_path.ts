import * as vscode from "vscode";

import { StructuralWorkspace } from "./structural_workspace";

export type ResolvedPath = {
	uri: vscode.Uri;
	insideCurrentWindow: boolean;
	currentWindowRoot?: vscode.Uri;
	structuralWorkspace?: StructuralWorkspace;
};

export function resourcePath(uri: vscode.Uri): string {
	return uri.scheme === "file" ? uri.fsPath : uri.toString();
}

export function parseResourceUri(value: string): vscode.Uri | undefined {
	// Do not mistake a Windows drive path such as C:\\work\\file for a URI.
	if (/^[a-zA-Z]:[\\/]/.test(value)) {
		return undefined;
	}

	if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
		return undefined;
	}

	try {
		const uri = vscode.Uri.parse(value, true);

		return uri.scheme ? uri : undefined;
	} catch {
		return undefined;
	}
}
