import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { detectStructuralWorkspace } from './detect_structural_workspace';
import { parseResourceUri, type ResolvedPath } from './resolved_path';

export async function resolvePath(inputPath: string): Promise<ResolvedPath> {
	const roots = getWorkspaceRoots();

	const requested = await resolveRequestedUri(inputPath, roots);

	const target = await canonicalize(requested);

	const canonicalRoots = await Promise.all(roots.map(canonicalize));

	const container = canonicalRoots.find((root) => isInside(root, target));

	const structuralWorkspace = container ? undefined : await detectStructuralWorkspace(target, canonicalRoots);

	return {
		uri: target,
		insideCurrentWindow: container !== undefined,
		currentWindowRoot: container,
		structuralWorkspace,
	};
}

export function getWorkspaceRoot(): vscode.Uri | undefined {
	return getWorkspaceRoots()[0];
}

export function getWorkspaceRoots(): vscode.Uri[] {
	return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri);
}

async function resolveRequestedUri(inputPath: string, roots: readonly vscode.Uri[]): Promise<vscode.Uri> {
	if (path.isAbsolute(inputPath)) {
		return vscode.Uri.file(inputPath);
	}

	const explicitUri = parseResourceUri(inputPath);

	if (explicitUri) {
		return explicitUri;
	}

	if (roots.length === 0) {
		throw Object.assign(new Error('No workspace folder is open.'), {
			code: 'NoWorkspace',
		});
	}

	const selected = await chooseRoot(inputPath, roots);

	return resolveRelative(selected.root, selected.relativePath);
}

async function chooseRoot(
	inputPath: string,
	roots: readonly vscode.Uri[],
): Promise<{
	root: vscode.Uri;
	relativePath: string;
}> {
	const folders = vscode.workspace.workspaceFolders ?? [];
	const normalized = normalizeInput(inputPath);
	const [first] = normalized.split('/');

	if (roots.length > 1) {
		const namedIndex = folders.findIndex((folder) => folder.name === first);

		if (namedIndex >= 0 && normalized.length > first.length) {
			return {
				root: roots[namedIndex],
				relativePath: normalized.slice(first.length + 1),
			};
		}

		for (const root of roots) {
			const candidate = resolveRelative(root, normalized);

			if (await exists(candidate)) {
				return {
					root,
					relativePath: normalized,
				};
			}
		}
	}

	return {
		root: roots[0],
		relativePath: normalized,
	};
}

function resolveRelative(root: vscode.Uri, inputPath: string): vscode.Uri {
	const resolvedPath = path.posix.resolve(root.path, normalizeInput(inputPath));

	return root.with({
		path: resolvedPath,
		query: '',
		fragment: '',
	});
}

function normalizeInput(inputPath: string): string {
	return inputPath.replace(/\\/g, '/');
}

async function exists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

async function canonicalize(uri: vscode.Uri): Promise<vscode.Uri> {
	if (uri.scheme !== 'file') {
		return uri;
	}

	return vscode.Uri.file(await realPath(uri.fsPath));
}

async function realPath(target: string): Promise<string> {
	try {
		return await fs.realpath(target);
	} catch {
		const parent = path.dirname(target);

		if (parent === target) {
			return target;
		}

		return path.join(await realPath(parent), path.basename(target));
	}
}

function isInside(parent: vscode.Uri, child: vscode.Uri): boolean {
	if (parent.scheme !== child.scheme || parent.authority !== child.authority) {
		return false;
	}

	if (parent.scheme === 'file' && child.scheme === 'file') {
		const relative = path.relative(parent.fsPath, child.fsPath);

		return relative === '' || (!isNativeParentRelative(relative) && !path.isAbsolute(relative));
	}

	const relative = path.posix.relative(parent.path, child.path);

	return relative === '' || (!isPosixParentRelative(relative) && !path.posix.isAbsolute(relative));
}

function isNativeParentRelative(relative: string): boolean {
	return relative === '..' || relative.startsWith(`..${path.sep}`);
}

function isPosixParentRelative(relative: string): boolean {
	return relative === '..' || relative.startsWith('../');
}
