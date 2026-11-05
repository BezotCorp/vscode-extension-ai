import * as path from 'node:path';
import * as vscode from 'vscode';

import { getWorkspaceRoots, resolvePath, resourcePath } from '../../../workspace';
import type { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { readStringArrayArg } from '../../tool_input';
import { toolFailure, toolSuccess } from '../../tool_result';

const MAX_ENTRIES = 1_000;

const IGNORED_DIRECTORIES = new Set([
	'.cache',
	'.git',
	'.next',
	'build',
	'coverage',
	'dist',
	'node_modules',
	'out',
	'target',
]);

type FileEntry = {
	depth: number;
	name: string;
	directory: boolean;
};

type FileSection = {
	label: string;
	entries: FileEntry[];
};

export class ListFilesTool implements Tool {
	readonly id = 'list_files';
	readonly name = 'List Files';
	readonly readOnlyCompatible = true;
	readonly permissionDefault = 'allow' as const;
	readonly description =
		'Lists the useful file structure for discovery. Use {"all":true} to list the whole current window, or {"paths":["src","docs"]} to list one or more specific directories. Use this before read_file when the exact file path is unknown. Generated directories such as target and node_modules are omitted.';

	readonly parameters = {
		type: 'object' as const,
		properties: {
			all: {
				type: 'boolean',
				description:
					'Set explicitly to true to list the useful structure of every folder in the current window. Cannot be combined with paths.',
			},
			paths: {
				type: 'array',
				items: { type: 'string' },
				description:
					'One or more directories to list. Paths may be relative to the current window or absolute. Cannot be combined with all.',
			},
		},
	};

	constructor(private readonly accessGuard: ToolAccessGuard) {}

	async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
		const values = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
		const all = values.all === true;
		const paths = readStringArrayArg(input, 'paths')
			?.map((value) => value.trim())
			.filter((value) => value.length > 0);

		if (all && paths?.length) {
			return toolFailure('error', this.id, undefined, {
				reason: 'invalid_arguments',
				message: 'Choose exactly one scope: {"all":true} or {"paths":[...]}, not both.',
				executed: false,
				retryable: true,
			});
		}

		if (!all && !paths?.length) {
			return toolFailure('error', this.id, undefined, {
				reason: 'invalid_arguments',
				message:
					'list_files needs an explicit scope. Use {"all":true} for the whole current window or {"paths":["..."]} for one or more directories.',
				executed: false,
				retryable: true,
			});
		}

		if (values.all !== undefined && values.all !== true) {
			return toolFailure('error', this.id, undefined, {
				reason: 'invalid_arguments',
				message: 'When "all" is provided it must be true.',
				executed: false,
				retryable: true,
			});
		}

		const requested = all ? getWorkspaceRoots().map((uri) => uri.toString()) : unique(paths ?? []);

		if (requested.length === 0) {
			return toolFailure('error', this.id, undefined, {
				reason: 'no_current_window',
				message: 'No folder is open in the current window.',
				executed: false,
				retryable: false,
			});
		}

		const sections: FileSection[] = [];
		let remaining = MAX_ENTRIES;
		let truncated = false;

		for (const requestedPath of requested) {
			if (context?.signal?.aborted) {
				return toolFailure('cancelled', this.id, requestedPath, {
					reason: 'cancelled_by_user',
					message: 'File listing was cancelled.',
					executed: false,
					retryable: true,
				});
			}

			const resolved = await resolvePath(requestedPath);

			await this.accessGuard.assertReadable(this, resolved, true, {
				signal: context?.signal,
			});

			let stat: vscode.FileStat;

			try {
				stat = await vscode.workspace.fs.stat(resolved.uri);
			} catch (error) {
				if (isNotFoundError(error)) {
					return toolFailure('error', this.id, resourcePath(resolved.uri), {
						reason: 'not_found',
						message:
							'The requested directory was not found. Use {"all":true} to discover the current window structure or list a known parent directory.',
						executed: false,
						retryable: true,
					});
				}

				throw error;
			}

			if (!(stat.type & vscode.FileType.Directory)) {
				return toolFailure('error', this.id, resourcePath(resolved.uri), {
					reason: 'not_a_directory',
					message: 'The requested path is not a directory. Use read_file when the exact file path is already known.',
					executed: false,
					retryable: true,
				});
			}

			const entries: FileEntry[] = [];

			const result = await walkDirectory(resolved.uri, 1, entries, remaining, this.accessGuard, context?.signal);

			if (result.cancelled) {
				return toolFailure('cancelled', this.id, resourcePath(resolved.uri), {
					reason: 'cancelled_by_user',
					message: 'File listing was cancelled.',
					executed: false,
					retryable: true,
				});
			}

			remaining -= result.used;
			truncated ||= result.truncated;

			sections.push({
				label: displayLabel(requestedPath, resolved.uri, all),
				entries,
			});

			if (remaining <= 0) {
				truncated = true;
				break;
			}
		}

		const content = sections.map(formatSection).join('\n\n');

		return toolSuccess(this.id, all ? 'current_window' : requested.join(', '), {
			content: content || '(empty)',
			details: {
				scope: all ? 'all' : 'paths',
				requested,
				entries: MAX_ENTRIES - remaining,
				truncated,
				ignoredDirectories: [...IGNORED_DIRECTORIES].sort(),
			},
		});
	}
}

async function walkDirectory(
	uri: vscode.Uri,
	depth: number,
	output: FileEntry[],
	remaining: number,
	accessGuard: ToolAccessGuard,
	signal?: AbortSignal,
): Promise<{ used: number; truncated: boolean; cancelled: boolean }> {
	if (signal?.aborted) {
		return { used: 0, truncated: false, cancelled: true };
	}

	if (remaining <= 0) {
		return { used: 0, truncated: true, cancelled: false };
	}

	const rawEntries = await vscode.workspace.fs.readDirectory(uri);

	const entries = rawEntries
		.filter(([name]) => !IGNORED_DIRECTORIES.has(name))
		.sort(([leftName, leftType], [rightName, rightType]) => {
			const leftDirectory = Boolean(leftType & vscode.FileType.Directory);
			const rightDirectory = Boolean(rightType & vscode.FileType.Directory);

			if (leftDirectory !== rightDirectory) {
				return leftDirectory ? -1 : 1;
			}

			return leftName.localeCompare(rightName);
		});

	let used = 0;
	let truncated = false;

	for (const [name, type] of entries) {
		if (signal?.aborted) {
			return { used, truncated, cancelled: true };
		}

		if (used >= remaining) {
			truncated = true;
			break;
		}

		const child = vscode.Uri.joinPath(uri, name);

		if (accessGuard.isProtected(resourcePath(child))) {
			continue;
		}

		const directory = Boolean(type & vscode.FileType.Directory);

		output.push({
			depth,
			name,
			directory,
		});

		used += 1;

		const symbolicLink = Boolean(type & vscode.FileType.SymbolicLink);

		if (directory && !symbolicLink) {
			const nested = await walkDirectory(child, depth + 1, output, remaining - used, accessGuard, signal);

			used += nested.used;
			truncated ||= nested.truncated;

			if (nested.cancelled) {
				return { used, truncated, cancelled: true };
			}

			if (used >= remaining) {
				truncated = true;
				break;
			}
		}
	}

	return { used, truncated, cancelled: false };
}

function formatSection(section: FileSection): string {
	const lines = [`${section.label}/`];

	for (const entry of section.entries) {
		const indent = '  '.repeat(entry.depth);
		lines.push(indent + entry.name + (entry.directory ? '/' : ''));
	}

	return lines.join('\n');
}

function displayLabel(requestedPath: string, uri: vscode.Uri, all: boolean): string {
	if (!all) {
		return requestedPath === '.' ? '.' : requestedPath.replace(/[\\/]+$/, '');
	}

	const folder = (vscode.workspace.workspaceFolders ?? []).find(
		(candidate) => candidate.uri.toString() === uri.toString(),
	);

	return folder?.name ?? path.posix.basename(uri.path);
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}

function isNotFoundError(error: unknown): boolean {
	const code = (error as { code?: unknown } | null)?.code;

	return code === 'ENOENT' || code === 'FileNotFound';
}
