import * as vscode from 'vscode';

import { contentEffect, PermissionError } from '../../../permissions';
import { findDirtyDocuments, ResolvedPath, resolvePath, truncateText } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { describeContent, readStringArg } from '../../tool_input';
import { toolErrorFromException, toolFailure, toolSuccess } from '../../tool_result';
import { FileRead } from './file_read';
import { FileVersionTracker } from './file_version_tracker';
import { READ_MODE_COMPOSED } from './read_mode';
import { ReadFileTool } from './read_file_tool';
import { unsavedChangesFailure } from './unsaved_changes_failure';
import { WriteFileData } from './write_file_data';
import { WriteFileState } from './write_file_state';
import { WriteFilePipeline } from './write_file_pipeline';

// Retries allowed after the first attempt when the file keeps changing: the initial attempt and two retries.
const MAX_RETRY = 2;

// Composed tool: it reads through ReadFileTool, checks the file is still the version the AI worked from, projects the
// new content in memory and hands it to the persistent pipeline (safety copy, write, integrity check, restoration).
// None of that is visible to the AI, which only calls write_file and gets the outcome.
export class WriteFileTool implements Tool {
  readonly id = 'write_file';
  readonly name = 'Write File';
  readonly readOnlyCompatible = false;
  readonly permissionDefault = 'ask' as const;
  readonly editsFiles = true;
  readonly description =
    'Replaces the whole content of an existing file. Read the file with read_file first: if it changed since you read it, nothing is written and you receive its current content, from which you must redo your change. Use edit_file to change only part of a file and create_file for new files. Refused when the file has unsaved changes in the editor.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'File path, relative to the workspace root or absolute.' },
      content: { type: 'string', description: 'New full content of the file.' },
    },
    required: ['path', 'content'],
  };

  constructor(
    private readonly accessGuard: ToolAccessGuard,
    private readonly reader: ReadFileTool,
    private readonly versions: FileVersionTracker,
    private readonly pipeline: WriteFilePipeline,
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

    const resolved = resolvePath(readStringArg(input, 'path') ?? '');
    const fsPath = resolved.uri.fsPath;

    if (findDirtyDocuments(resolved.uri).length > 0) {
      return unsavedChangesFailure(this.id, fsPath);
    }

    // A conflict hands the current content back to the AI, which is a way of reading the file.
    await this.accessGuard.assertReadable(this, resolved, false, { signal: context?.signal });

    try {
      const stat = await vscode.workspace.fs.stat(resolved.uri);

      if (stat.type & vscode.FileType.Directory) {
        return toolFailure('error', this.id, fsPath, {
          reason: 'is_a_directory',
          message: 'The path is a directory; nothing was written.',
          executed: false,
          retryable: false,
        });
      }

      const before = await this.checkVersion(resolved);

      if (before.conflict) {
        return this.conflict(fsPath, before.read, before.known);
      }

      await this.accessGuard.assertPath(this, 'write', resolved, false, {
        detail: describeContent(content),
        effects: [contentEffect(fsPath)],
        signal: context?.signal,
      });

      // The dialog can stay open for a long time: the file must still be the version the AI worked from.
      const after = await this.checkVersion(resolved);

      if (after.conflict) {
        return this.conflict(fsPath, after.read, after.known);
      }

      // The projection: the exact bytes the file has to contain once written.
      const projected = new TextEncoder().encode(content);
      const record = await this.pipeline.run(resolved.uri, projected, after.read.sha);
      const data = record.data as WriteFileData;

      switch (record.state) {
        case 'integrity_true':
          this.versions.remember(fsPath, data.expectedSha);
          this.versions.clearConflicts(fsPath);

          return toolSuccess(this.id, fsPath, {
            message: 'File replaced on disk and checked: it contains exactly the content you sent.',
            details: { via: 'disk', bytesWritten: projected.length, verified: true },
          });
        case 'copy_conflict':
          return this.conflictFromPipeline(resolved, record.state);
        case 'copy_failed':
          return toolFailure('error', this.id, fsPath, {
            reason: 'backup_failed',
            message: 'The safety copy of the file could not be made, so nothing was written. The file is unchanged.',
            executed: false,
            retryable: true,
          });
        case 'update_conflict':
          return this.conflictFromPipeline(resolved, record.state);
        case 'update_failed':
          return toolFailure('error', this.id, fsPath, {
            reason: 'write_not_attempted',
            message: `The file could not be written (${data.reason ?? 'unknown reason'}). It was not changed.`,
            executed: false,
            retryable: true,
          });
        case 'restore_done':
          return toolFailure('error', this.id, fsPath, {
            reason: data.reason === 'write_error' ? 'write_failed' : 'integrity_check_failed',
            message:
              data.reason === 'write_error'
                ? `The write failed (${data.error ?? 'unknown error'}) and the original was restored from the safety copy and checked. The file is as it was before.`
                : 'After writing, the file did not contain exactly the intended content, so the original was restored. The file is as it was before.',
            executed: true,
            retryable: true,
          });
        default:
          void vscode.window.showErrorMessage(
            `BezotCorp AI: ${fsPath} could not be written correctly and could not be restored. The original is kept at ${data.backupPath}.`,
          );

          return toolFailure('error', this.id, fsPath, {
            reason: 'restore_failed',
            message:
              'After writing, the file did not contain the intended content and the original could not be restored. The user has been told where the safety copy is. Do not write to this file again.',
            executed: true,
            retryable: false,
          });
      }
    } catch (error) {
      if (error instanceof PermissionError) {
        throw error;
      }

      return toolErrorFromException(this.id, fsPath, error, true);
    }
  }

  // Reads the file as it is on the filesystem now and compares it with the version the AI has seen.
  private async checkVersion(
    resolved: ResolvedPath,
  ): Promise<{ conflict: boolean; known: boolean; read: FileRead }> {
    const read = await this.reader.read(resolved, READ_MODE_COMPOSED);
    const seen = this.versions.seen(resolved.uri.fsPath);

    return { conflict: seen !== read.sha, known: seen !== undefined, read };
  }

  // The file changed after the pipeline had started but before anything was written: same handling as any conflict.
  private async conflictFromPipeline(resolved: ResolvedPath, pipelineState: WriteFileState): Promise<ToolExecutionResult> {
    const read = await this.reader.read(resolved, READ_MODE_COMPOSED);

    return this.conflict(resolved.uri.fsPath, read, true, pipelineState);
  }

  // Nothing is written. The AI gets the fresh content and starts again from it, up to MAX_RETRY retries.
  private conflict(fsPath: string, read: FileRead, known: boolean, pipelineState?: WriteFileState): ToolExecutionResult {
    const conflicts = this.versions.recordConflict(fsPath);
    const shown = read.binary ? undefined : truncateText(read.text);

    // From here the AI holds this version, so it is the one the next attempt is compared with.
    if (!read.binary) {
      this.versions.remember(fsPath, read.sha);
    }

    if (conflicts <= MAX_RETRY) {
      return toolFailure('error', this.id, fsPath, {
        reason: 'file_changed',
        message: known
          ? 'The file changed since you read it. Nothing was written. Its current content is below: redo your change from this version and call write_file again.'
          : 'You had not read the current version of this file. Nothing was written. Its current content is below: redo your change from this version and call write_file again.',
        executed: false,
        retryable: true,
        details: { retriesLeft: MAX_RETRY - (conflicts - 1), binary: read.binary },
        content: shown?.text,
      });
    }

    this.versions.clearConflicts(fsPath);
    void vscode.window.showWarningMessage(
      `BezotCorp AI: write_file was stopped on ${fsPath}. The file kept changing between attempts, so the operation could not be done. No change was applied to the file.`,
    );

    return toolFailure('error', this.id, fsPath, {
      reason: 'concurrent_modifications',
      message:
        'write_file was stopped for good: the file kept changing after the retries allowed. Nothing was written and the user has already been told, so do not explain it at length. Do not repeat the earlier attempt as it was: decide what to do from the current content of the file.',
      executed: false,
      retryable: false,
      details: {
        event: 'write_file_stopped',
        cause: 'repeated_concurrent_modifications',
        retriesAllowed: MAX_RETRY,
        finalState: 'no_change_applied',
        persistentPipelineStarted: pipelineState !== undefined,
        ...(pipelineState && { pipelineState }),
        userInformedAutomatically: true,
        currentContentIncluded: shown !== undefined,
        doNotRepeatPreviousAttemptBlindly: true,
        decideFromCurrentState: true,
      },
      content: shown?.text,
    });
  }
}
