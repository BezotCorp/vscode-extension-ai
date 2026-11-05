import * as path from 'node:path';
import * as vscode from 'vscode';

import type { StructuralWorkspace } from './structural_workspace';
import { MAX_MANIFEST_BYTES } from './structural_workspace_limits';

export async function detectStructuralWorkspace(
	target: vscode.Uri,
	currentWindowRoots: readonly vscode.Uri[],
): Promise<StructuralWorkspace | undefined> {
	const candidates = new Map<string, StructuralWorkspace>();

	for (const root of currentWindowRoots) {
		for (const parent of parents(root)) {
			const detected = await detectAt(parent);

			if (detected && isInside(detected.root, root) && isInside(detected.root, target)) {
				candidates.set(detected.root.toString(), detected);
			}
		}
	}

	return [...candidates.values()].sort((left, right) => right.root.path.length - left.root.path.length)[0];
}

async function detectAt(root: vscode.Uri): Promise<StructuralWorkspace | undefined> {
	const cargo = vscode.Uri.joinPath(root, 'Cargo.toml');

	if ((await isFile(cargo)) && (await cargoContainsWorkspace(cargo))) {
		return {
			kind: 'cargo',
			root,
			marker: cargo,
		};
	}

	const pnpm = vscode.Uri.joinPath(root, 'pnpm-workspace.yaml');

	if (await isFile(pnpm)) {
		return {
			kind: 'pnpm',
			root,
			marker: pnpm,
		};
	}

	const packageJson = vscode.Uri.joinPath(root, 'package.json');

	if ((await isFile(packageJson)) && (await packageContainsWorkspaces(packageJson))) {
		return {
			kind: 'node',
			root,
			marker: packageJson,
		};
	}

	return undefined;
}

async function cargoContainsWorkspace(uri: vscode.Uri): Promise<boolean> {
	const text = await readSmallText(uri);

	return text !== undefined && /^\s*\[workspace(?:\.[^\]]+)?\]\s*$/m.test(text);
}

async function packageContainsWorkspaces(uri: vscode.Uri): Promise<boolean> {
	const text = await readSmallText(uri);

	if (text === undefined) {
		return false;
	}

	try {
		const value = JSON.parse(text) as {
			workspaces?: unknown;
		};

		return Array.isArray(value.workspaces) || (typeof value.workspaces === 'object' && value.workspaces !== null);
	} catch {
		return false;
	}
}

async function readSmallText(uri: vscode.Uri): Promise<string | undefined> {
	try {
		const stat = await vscode.workspace.fs.stat(uri);

		if (!(stat.type & vscode.FileType.File) || stat.size > MAX_MANIFEST_BYTES) {
			return undefined;
		}

		return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
	} catch {
		return undefined;
	}
}

async function isFile(uri: vscode.Uri): Promise<boolean> {
	try {
		const stat = await vscode.workspace.fs.stat(uri);

		return Boolean(stat.type & vscode.FileType.File);
	} catch {
		return false;
	}
}

function parents(start: vscode.Uri): vscode.Uri[] {
	const result: vscode.Uri[] = [];
	let current = start;

	for (;;) {
		result.push(current);

		const parentPath = path.posix.dirname(current.path);

		if (parentPath === current.path) {
			return result;
		}

		current = current.with({
			path: parentPath,
			query: '',
			fragment: '',
		});
	}
}

function isInside(parent: vscode.Uri, child: vscode.Uri): boolean {
	if (parent.scheme !== child.scheme || parent.authority !== child.authority) {
		return false;
	}

	const relative = path.posix.relative(parent.path, child.path);

	return relative === '' || (!isParentRelative(relative) && !path.posix.isAbsolute(relative));
}

function isParentRelative(relative: string): boolean {
	return relative === '..' || relative.startsWith('../');
}
