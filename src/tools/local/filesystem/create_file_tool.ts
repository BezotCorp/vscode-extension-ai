import * as path from 'node:path';
import * as vscode from 'vscode';

import { contentEffect } from '../../../permissions';
import { resolvePath } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { describeContent, readStringArg } from '../../tool_input';
import { toolFailure, toolSuccess } from '../../tool_result';

export class CreateFileTool implements Tool {
  readonly id = 'create_file';
  readonly name = 'Create File';
  readonly readOnlyCompatible = false;
  readonly description =
    'Creates a new file (and missing parent folders) with the given content. Fails if the file already exists.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'File path, relative to the workspace root or absolute.' },
      content: { type: 'string', description: 'Content of the new file.' },
    },
    required: ['path', 'content'],
  };

  constructor(private readonly accessGuard: ToolAccessGuard) {}

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

    const resolved = resolvePath(readStringArg(input, 'path') ?? '');
    const fsPath = resolved.uri.fsPath;

    await this.accessGuard.assertPath('create', resolved, false, {
      operation: this.id,
      detail: describeContent(content),
      effects: [contentEffect(fsPath)],
      signal: context?.signal,
    });

    if (await exists(resolved.uri)) {
      return toolFailure('error', this.id, fsPath, {
        reason: 'already_exists',
        message: 'The file already exists and was not changed. Use write_file to replace it.',
        executed: false,
        retryable: false,
      });
    }

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(fsPath)));

    const bytes = new TextEncoder().encode(content);

    await vscode.workspace.fs.writeFile(resolved.uri, bytes);

    return toolSuccess(this.id, fsPath, {
      message: 'File created.',
      details: { bytesWritten: bytes.length },
    });
  }
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
