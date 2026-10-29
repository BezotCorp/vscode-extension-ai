import { getWorkspaceRoot, resolvePath } from '../../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '../..';
import { readNumberArg, readStringArg, readStringArrayArg } from '../../tool_input';
import { toolFailure, toolSuccess } from '../../tool_result';
import { runProcess } from './process_runner';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 300_000;

export class RunCommandTool implements Tool {
  readonly id = 'run_command';
  readonly name = 'Run Command';
  readonly readOnlyCompatible = false;
  readonly description =
    'Runs an external program without a shell and returns its exit code, stdout and stderr. Pass arguments as a list.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      program: { type: 'string', description: 'Program to run, for example "git" or "pnpm".' },
      args: { type: 'array', items: { type: 'string' }, description: 'Arguments, one list item per argument.' },
      cwd: { type: 'string', description: 'Working directory. Defaults to the workspace root.' },
      timeoutMs: { type: 'number', description: `Timeout in milliseconds (default ${DEFAULT_TIMEOUT_MS}).` },
    },
    required: ['program'],
  };

  constructor(private readonly accessGuard: ToolAccessGuard) {}

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const program = readStringArg(input, 'program') ?? '';
    const args = readStringArrayArg(input, 'args') ?? [];
    const cwdArg = readStringArg(input, 'cwd');
    const cwd = cwdArg ? resolvePath(cwdArg).uri.fsPath : getWorkspaceRoot();
    const commandLine = [program, ...args].map(quote).join(' ');
    const timeoutMs = Math.min(readNumberArg(input, 'timeoutMs') ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

    await this.accessGuard.authorize(
      {
        capability: 'execute',
        scope: { kind: 'command', value: commandLine },
        grantScopes: [
          { kind: 'command', value: commandLine },
          { kind: 'command', value: program },
        ],
        operation: this.id,
        detail: `Command: ${commandLine}\nWorking directory: ${cwd ?? '(none)'}\nTimeout: ${timeoutMs} ms`,
      },
      context?.signal,
    );

    const run = await runProcess({ program, args, cwd, timeoutMs, signal: context?.signal });
    const details = {
      program,
      args,
      cwd,
      exitCode: run.exitCode,
      terminatedBySignal: run.terminatedBySignal,
      durationMs: run.durationMs,
      stdoutTruncated: run.stdoutTruncated,
      stderrTruncated: run.stderrTruncated,
    };
    const content = [run.stdout && `[stdout]\n${run.stdout}`, run.stderr && `[stderr]\n${run.stderr}`]
      .filter(Boolean)
      .join('\n');

    if (!run.started) {
      if (run.aborted) {
        return toolFailure('cancelled', this.id, commandLine, {
          reason: 'cancelled_by_user',
          message: 'The request was cancelled before the command started. Nothing was executed.',
          executed: false,
          retryable: true,
        });
      }

      return toolFailure('error', this.id, commandLine, {
        reason: run.spawnError?.code === 'ENOENT' ? 'program_not_found' : 'spawn_failed',
        message: `The program could not be started: ${run.spawnError?.message ?? 'unknown error'}`,
        executed: false,
        retryable: false,
        details: { ...details, code: run.spawnError?.code },
      });
    }

    if (run.aborted) {
      return toolFailure('cancelled', this.id, commandLine, {
        reason: 'cancelled_by_user',
        message: 'The command was started, then stopped by cancellation. It may have partially executed.',
        executed: true,
        retryable: false,
        content,
        details,
      });
    }

    if (run.timedOut) {
      return toolFailure('interrupted', this.id, commandLine, {
        reason: 'timeout',
        message: `The command was stopped after ${timeoutMs} ms. It may have partially executed.`,
        executed: true,
        retryable: false,
        content,
        details,
      });
    }

    if (run.terminatedBySignal) {
      return toolFailure('interrupted', this.id, commandLine, {
        reason: 'terminated_by_signal',
        message: `The command was terminated by ${run.terminatedBySignal}. It may have partially executed.`,
        executed: true,
        retryable: false,
        content,
        details,
      });
    }

    if (run.exitCode !== 0) {
      return toolFailure('error', this.id, commandLine, {
        reason: 'non_zero_exit',
        message: `The command ran and exited with code ${run.exitCode}.`,
        executed: true,
        retryable: false,
        content,
        details,
      });
    }

    return toolSuccess(this.id, commandLine, { content, details });
  }
}

function quote(part: string): string {
  return /[\s"']/.test(part) ? JSON.stringify(part) : part;
}
