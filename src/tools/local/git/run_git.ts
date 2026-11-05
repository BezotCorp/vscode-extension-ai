import { spawn } from 'node:child_process';
import { KILL_GRACE_MS } from '../../../process_limits';
import { baseEnvironment } from '../../base_environment';
import { BoundedText } from './bounded_text';
import { SAFETY_OPTIONS } from './git_safety_options';
import type { GitRunOptions } from './git_run_options';
import type { GitRunResult } from './git_run_result';

// The only program the extension starts for git tools is git itself, without a shell, with arguments the tools
// built from validated parameters. There is no way to pass a program name or a raw command line.
export function runGit(options: GitRunOptions): Promise<GitRunResult> {
	return new Promise((resolve) => {
		const startedAt = Date.now();
		const stdout = new BoundedText();
		const stderr = new BoundedText();
		const finish = (partial: Partial<GitRunResult>) =>
			resolve({
				started: true,
				exitCode: null,
				terminatedBySignal: null,
				timedOut: false,
				aborted: false,
				stdout: stdout.toString(),
				stderr: stderr.toString(),
				truncated: stdout.truncated || stderr.truncated,
				durationMs: Date.now() - startedAt,
				...partial,
			});

		if (options.signal?.aborted) {
			finish({ started: false, aborted: true });
			return;
		}

		const child = spawn('git', [...SAFETY_OPTIONS, ...options.args], {
			cwd: options.cwd,
			shell: false,
			env: {
				...baseEnvironment([
					'SSH_AUTH_SOCK',
					'XDG_CONFIG_HOME',
					'GIT_AUTHOR_NAME',
					'GIT_AUTHOR_EMAIL',
					'GIT_COMMITTER_NAME',
					'GIT_COMMITTER_EMAIL',
				]),
				// No prompt can be answered: a missing credential or an editor request must fail, not hang.
				GIT_TERMINAL_PROMPT: '0',
				GIT_EDITOR: 'true',
				GIT_PAGER: 'cat',
				LC_MESSAGES: 'C',
				GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes',
			},
			// Own process group on POSIX so a timeout or cancellation also stops git's children (ssh, hooks).
			detached: process.platform !== 'win32',
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let spawned = false;
		let timedOut = false;
		let aborted = false;
		let killTimer: NodeJS.Timeout | undefined;

		const terminate = (killSignal: NodeJS.Signals) => {
			try {
				if (process.platform !== 'win32' && child.pid) {
					process.kill(-child.pid, killSignal);
				} else {
					child.kill(killSignal);
				}
			} catch {
				// The process is already gone.
			}
		};
		const stop = () => {
			terminate('SIGTERM');
			killTimer = setTimeout(() => terminate('SIGKILL'), KILL_GRACE_MS);
		};
		const timeoutTimer = setTimeout(() => {
			timedOut = true;
			stop();
		}, options.timeoutMs);
		const onAbort = () => {
			aborted = true;
			stop();
		};
		const cleanup = () => {
			clearTimeout(timeoutTimer);
			clearTimeout(killTimer);
			options.signal?.removeEventListener('abort', onAbort);
		};

		options.signal?.addEventListener('abort', onAbort, { once: true });
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => stdout.append(chunk));
		child.stderr.on('data', (chunk: string) => stderr.append(chunk));
		child.on('spawn', () => {
			spawned = true;
		});

		child.on('error', (error: NodeJS.ErrnoException) => {
			if (spawned) {
				return;
			}

			cleanup();
			finish({
				started: false,
				spawnError: { code: error.code, message: error.message },
			});
		});

		child.on('close', (exitCode, terminatedBySignal) => {
			cleanup();
			finish({ exitCode, terminatedBySignal, timedOut, aborted });
		});
	});
}
