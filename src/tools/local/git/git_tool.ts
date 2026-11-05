import * as path from 'node:path';

import { getWorkspaceRoots, truncateText } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult, ToolParametersSchema } from '../..';
import { readStringArg } from '../../tool_input';
import { toolFailure, toolSuccess } from '../../tool_result';
import { GitPlan } from './git_plan';
import { runGit } from './run_git';
import { t } from '../../../i18n';

const DEFAULT_TIMEOUT_MS = 30_000;

export const FOLDER_PARAMETER = {
  type: 'string',
  description: 'Workspace folder name, only needed when several folders are open. Defaults to the first.',
};

// Common part of the git tools. A tool states its command and validates its parameters in plan(); this class
// resolves the repository, asks for the permission, runs git and turns the outcome into a result the model can act on.
export abstract class GitTool implements Tool {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: ToolParametersSchema;
  abstract readonly readOnlyCompatible: boolean;
  abstract readonly permissionDefault: 'allow' | 'ask';
  // git can run programs named by a repository's own configuration and hooks: never in an untrusted workspace.
  readonly requiresTrust = true;

  constructor(protected readonly accessGuard: ToolAccessGuard) {}

  // The command to run, or a failure result when the parameters are not valid.
  protected abstract plan(
    input: unknown,
    repository: string,
    signal?: AbortSignal,
  ): Promise<GitPlan | ToolExecutionResult>;

  protected reject(message: string): ToolExecutionResult {
    return toolFailure('error', this.id, undefined, {
      reason: 'invalid_arguments',
      message,
      executed: false,
      retryable: true,
    });
  }

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const repository = this.resolveRepository(readStringArg(input, 'folder'));

    if (typeof repository !== 'string') {
      return repository;
    }

    const plan = await this.plan(input, repository, context?.signal);

    if (!('args' in plan)) {
      return plan;
    }

    await this.accessGuard.authorize(
      {
        tool: this,
        action: plan.action ?? `run ${this.name} in ${repository}`,
        actionLabel: plan.actionLabel ?? t('action.git.run', { tool: this.name, repository }),
        resources: (plan.paths ?? []).map((fsPath) => ({
          path: fsPath,
          isDirectory: false,
          boundary: {
            kind: 'currentWindow' as const,
            root: repository,
          },
        })),
        detail: plan.detail,
      },
      context?.signal,
    );

    return this.run(plan, repository, context?.signal);
  }

  // Runs a plan without asking: for the read-only commands a tool uses to describe what it is about to do.
  protected async capture(args: string[], repository: string, signal?: AbortSignal): Promise<string | undefined> {
    const run = await runGit({
      args: ['--no-optional-locks', ...args],
      cwd: repository,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      signal,
    });

    return run.started && run.exitCode === 0 ? run.stdout.trim() : undefined;
  }

  private resolveRepository(folder: string | undefined): string | ToolExecutionResult {
    const roots = getWorkspaceRoots();

    if (roots.length === 0) {
      return toolFailure('error', this.id, undefined, {
        reason: 'no_workspace',
        message: 'No workspace folder is open.',
        executed: false,
        retryable: false,
      });
    }

    const filesystemRoots = roots.filter((root) => root.scheme === 'file');

    if (filesystemRoots.length === 0) {
      return toolFailure('error', this.id, undefined, {
        reason: 'git_requires_filesystem',
        message: 'Git tools require a workspace backed by a filesystem path available to the git executable.',
        executed: false,
        retryable: false,
      });
    }

    const chosen = folder ? filesystemRoots.find((root) => path.basename(root.fsPath) === folder) : filesystemRoots[0];

    return (
      chosen?.fsPath ??
      toolFailure('error', this.id, folder, {
        reason: 'unknown_folder',
        message:
          `No filesystem-backed workspace folder is named "${folder}". ` +
          `Open folders: ${filesystemRoots.map((root) => path.basename(root.fsPath)).join(', ')}.`,
        executed: false,
        retryable: true,
      })
    );
  }

  private async run(plan: GitPlan, repository: string, signal?: AbortSignal): Promise<ToolExecutionResult> {
    const timeoutMs = plan.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const run = await runGit({
      args: this.readOnlyCompatible ? ['--no-optional-locks', ...plan.args] : plan.args,
      cwd: repository,
      timeoutMs,
      signal,
    });
    const resource = `git ${plan.args[0]}`;
    const details = {
      command: plan.args[0],
      exitCode: run.exitCode,
      durationMs: run.durationMs,
      outputTruncated: run.truncated,
    };

    if (!run.started) {
      if (run.aborted) {
        return toolFailure('cancelled', this.id, resource, {
          reason: 'cancelled_by_user',
          message: 'The request was cancelled before git started. Nothing was executed.',
          executed: false,
          retryable: true,
        });
      }

      return toolFailure('error', this.id, resource, {
        reason: run.spawnError?.code === 'ENOENT' ? 'git_not_found' : 'spawn_failed',
        message:
          run.spawnError?.code === 'ENOENT'
            ? 'git is not installed or not on the PATH, so no git tool can work.'
            : `git could not be started: ${run.spawnError?.message ?? 'unknown error'}`,
        executed: false,
        retryable: false,
      });
    }

    const output = [run.stdout && run.stdout, run.stderr && `[stderr]\n${run.stderr}`].filter(Boolean).join('\n');

    if (run.aborted || run.timedOut || run.terminatedBySignal) {
      const why = run.aborted
        ? 'stopped by cancellation'
        : run.timedOut
          ? `stopped after ${timeoutMs} ms`
          : `terminated by ${run.terminatedBySignal}`;

      return toolFailure(run.aborted ? 'cancelled' : 'interrupted', this.id, resource, {
        reason: run.aborted ? 'cancelled_by_user' : run.timedOut ? 'timeout' : 'terminated_by_signal',
        message: this.readOnlyCompatible
          ? `git was ${why}.`
          : `git was ${why}. It may have partially run: check the state with git_status before anything else.`,
        executed: true,
        retryable: false,
        content: output,
        details,
      });
    }

    if (run.exitCode !== 0) {
      const notRepository = /not a git repository/i.test(run.stderr);

      return toolFailure('error', this.id, resource, {
        reason: notRepository ? 'not_a_git_repository' : 'git_failed',
        message: notRepository
          ? 'The workspace folder is not a git repository.'
          : `git exited with code ${run.exitCode}. The message is in the content.`,
        executed: !notRepository,
        retryable: false,
        content: truncateText(output).text,
        details,
      });
    }

    const text = truncateText(output);

    return toolSuccess(this.id, resource, {
      content: text.text || undefined,
      message: text.text ? undefined : 'git finished without output.',
      details: { ...details, truncatedForContext: text.truncated },
    });
  }
}
