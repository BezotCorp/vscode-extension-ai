import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { contentEffect } from '../../../permissions';
import { resolvePath } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { describeContent, readStringArg } from '../../tool_input';
import { toolFailure, toolSuccess } from '../../tool_result';

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

    await this.accessGuard.assertPath(this, 'create', resolved, false, {
      detail: describeContent(content),
      effects: [contentEffect(fsPath)],
      signal: context?.signal,
    });

    await fs.mkdir(path.dirname(fsPath), { recursive: true });

    const bytes = new TextEncoder().encode(content);
    const handle = await fs.open(fsPath, 'wx');

    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }

    return toolSuccess(this.id, fsPath, {
      message: 'File created.',
      details: { bytesWritten: bytes.length },
    });
  }
}
