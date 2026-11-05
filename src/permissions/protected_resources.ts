import * as path from 'node:path';
import * as vscode from 'vscode';

import { parseResourceUri, resourcePath } from '../workspace';
import { pathMatches } from './path_matches';
import { DEFAULT_PROTECTED, TEMPLATE_SUFFIX } from './protected_resource_patterns';

function addedProtectedPatterns(): string[] {
	const added = vscode.workspace.getConfiguration('bezotcorpAi').inspect<string[]>('protectedPaths')?.globalValue;

	return Array.isArray(added) ? added.filter((item) => typeof item === 'string') : [];
}

export function getProtectedPatterns(): string[] {
	return [...DEFAULT_PROTECTED, ...addedProtectedPatterns()];
}

// The pattern that protects this resource, if any.
//
// Explicit user rules always win. Template filenames are exempt only from
// built-in rules that match the filename itself; a protected ancestor such as
// .ssh still protects everything below it.
export function isProtectedResource(resource: string): string | undefined {
	const roots = (vscode.workspace.workspaceFolders ?? []).map((folder) => resourcePath(folder.uri));
	const added = addedProtectedPatterns();

	const explicit = added.find((pattern) => pathMatches(pattern, resource, roots));

	if (explicit !== undefined) {
		return explicit;
	}

	const builtIn = DEFAULT_PROTECTED.filter((pattern) => pathMatches(pattern, resource, roots));

	if (builtIn.length === 0) {
		return undefined;
	}

	const basename = resourceBasename(resource);

	if (TEMPLATE_SUFFIX.test(basename)) {
		const ancestorProtection = builtIn.find((pattern) => !pathMatches(pattern, basename, []));

		if (ancestorProtection === undefined) {
			return undefined;
		}

		return ancestorProtection;
	}

	return builtIn[0];
}

function resourceBasename(resource: string): string {
	const uri = parseResourceUri(resource);

	return uri ? path.posix.basename(uri.path) : path.basename(resource);
}
