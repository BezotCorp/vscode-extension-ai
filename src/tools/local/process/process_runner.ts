import { spawn } from 'node:child_process';

const HEAD_CHARS = 4_000;
const TAIL_CHARS = 8_000;
const KILL_GRACE_MS = 2_000;

export type ProcessRunOptions = {
  program: string;
  args: string[];
  cwd?: string;
  timeoutMs: number;
  signal?: AbortSignal;
};

export type ProcessRunResult = {
  // False when the program could not be launched at all (for example it was not found).
  started: boolean;
  spawnError?: { code?: string; message: string };
  exitCode: number | null;
  terminatedBySignal: string | null;
  timedOut: boolean;
  aborted: boolean;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
};

// Keeps the beginning and the end of a stream, which is where commands print what matters.
class BoundedText {
  private head = '';
  private tail = '';
  private omitted = 0;

  append(chunk: string): void {
    if (this.head.length < HEAD_CHARS) {
      const room = HEAD_CHARS - this.head.length;

      this.head += chunk.slice(0, room);
      chunk = chunk.slice(room);
    }

    this.tail += chunk;

    if (this.tail.length > TAIL_CHARS) {
      this.omitted += this.tail.length - TAIL_CHARS;
      this.tail = this.tail.slice(-TAIL_CHARS);
    }
  }

  get truncated(): boolean {
    return this.omitted > 0;
  }

  toString(): string {
    return this.omitted > 0 ? `${this.head}\n/* ${this.omitted} characters omitted */\n${this.tail}` : this.head + this.tail;
  }
}

export function runProcess(options: ProcessRunOptions): Promise<ProcessRunResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const stdout = new BoundedText();
    const stderr = new BoundedText();
    const finish = (partial: Partial<ProcessRunResult>) =>
      resolve({
        started: true,
        exitCode: null,
        terminatedBySignal: null,
        timedOut: false,
        aborted: false,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
        durationMs: Date.now() - startedAt,
        ...partial,
      });

    if (options.signal?.aborted) {
      finish({ started: false, aborted: true });
      return;
    }

    const child = spawn(options.program, options.args, {
      cwd: options.cwd,
      shell: false,
      // Own process group on POSIX so a timeout or cancellation also stops the program's children.
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
      finish({ started: false, spawnError: { code: error.code, message: error.message } });
    });

    child.on('close', (exitCode, terminatedBySignal) => {
      cleanup();
      finish({ exitCode, terminatedBySignal, timedOut, aborted });
    });
  });
}
