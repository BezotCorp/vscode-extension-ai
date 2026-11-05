import * as path from 'node:path';
import * as vscode from 'vscode';

import { parseResourceUri, resourcePath } from '../workspace';
import { pathMatches } from './path_matches';
import { DEFAULT_PROTECTED, TEMPLATE_SUFFIX } from './protected_resource_patterns';

export function getProtectedPatterns(): string[] {
	const added = vscode.workspace.getConfiguration('bezotcorpAi').inspect<string[]>('protectedPaths')?.globalValue;

	return [...DEFAULT_PROTECTED, ...(Array.isArray(added) ? added.filter((item) => typeof item === 'string') : [])];
}

// The pattern that protects this resource, if any.
export function isProtectedResource(resource: string): string | undefined {
	if (TEMPLATE_SUFFIX.test(resourceBasename(resource))) {
		return undefined;
	}

	const roots = (vscode.workspace.workspaceFolders ?? []).map((folder) => resourcePath(folder.uri));

	return getProtectedPatterns().find((pattern) => pathMatches(pattern, resource, roots));
}

// The same protection for git output, as pathspecs that leave the files out of a diff or a show.
// Git only operates on filesystem-backed workspaces.
export function protectedPathspecs(): string[] {
	return getProtectedPatterns().flatMap((pattern) => {
		if (pattern.startsWith('//') || pattern.startsWith('~/')) {
			return [];
		}

		const relative = pattern.replace(/^\.\//, '').replace(/^\//, '');

		const anywhere = pattern.startsWith('/') || relative.includes('/') ? relative : `**/${relative}`;

		return [`:(exclude,glob)${anywhere}`, `:(exclude,glob)${anywhere}/**`];
	});
}

function resourceBasename(resource: string): string {
	const uri = parseResourceUri(resource);

	return uri ? path.posix.basename(uri.path) : path.basename(resource);
}
