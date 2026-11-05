import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { contentEffect } from '../../../permissions';
import { resolvePath, resourcePath, sha256Hex } from '../../../workspace';
import type { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { ACCESS_PARAMETER, describeContent, readAccessArg, readStringArg } from '../../tool_input';
import { toolFailure, toolSuccess } from '../../tool_result';
import type { FileVersionTracker } from './file_version_tracker';

export class CreateFileTool implements Tool {
	readonly id = 'create_file';
	readonly name = 'Create File';
	readonly readOnlyCompatible = false;
	readonly permissionDefault = 'ask' as const;
	readonly editsFiles = true;
	readonly description =
		'Creates a new file (and missing parent folders) with the given content. Fails if the file already exists.';
	readonly parameters = {
		type: 'object' as const,
		properties: {
			path: {
				type: 'string',
				description: 'File path, relative to the workspace root or absolute.',
			},
			content: { type: 'string', description: 'Content of the new file.' },
			access: ACCESS_PARAMETER,
		},
		required: ['path', 'content'],
	};

	constructor(
		private readonly accessGuard: ToolAccessGuard,
		private readonly versions: FileVersionTracker,
	) {}

	async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
		const content = (input as { content?: unknown } | null)?.content;

		if (typeof content !== 'string') {
			return toolFailure('error', this.id, undefined, {
				reason: 'invalid_arguments',
				message: 'Argument "content" must be a string.',
				executed: false,
				retryable: true,
			});
		}

		const resolved = await resolvePath(readStringArg(input, 'path') ?? '');
		const resource = resourcePath(resolved.uri);

		await this.accessGuard.assertPath(this, 'create', resolved, false, {
			detail: describeContent(content),
			effects: [contentEffect(resource)],
			access: readAccessArg(input),
			signal: context?.signal,
		});

		const parent = resolved.uri.with({
			path: path.posix.dirname(resolved.uri.path),
			query: '',
			fragment: '',
		});

		await vscode.workspace.fs.createDirectory(parent);

		const bytes = new TextEncoder().encode(content);
		const temporary = vscode.Uri.joinPath(parent, `.bezotcorp-ai-${randomUUID()}.tmp`);

		try {
			await vscode.workspace.fs.writeFile(temporary, bytes);

			await vscode.workspace.fs.rename(temporary, resolved.uri, {
				overwrite: false,
			});
		} finally {
			await Promise.resolve(vscode.workspace.fs.delete(temporary, { useTrash: false })).catch(() => undefined);
		}

		this.versions.remember(resource, sha256Hex(bytes), content, true);

		return toolSuccess(this.id, resource, {
			message: 'File created.',
			details: { bytesWritten: bytes.length },
		});
	}
}
