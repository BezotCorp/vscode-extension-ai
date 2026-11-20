import { afterEach, describe, expect, it } from 'vitest';

import { runGit } from '../run_git';

const saved = { ...process.env };
const cwd = process.cwd();

afterEach(() => {
  process.env = { ...saved };
});

describe('runGit', () => {
  it('runs git and collects its output and exit code', async () => {
    const result = await runGit({ args: ['--version'], cwd, timeoutMs: 10_000 });

    expect(result).toMatchObject({ started: true, exitCode: 0, timedOut: false, aborted: false, truncated: false });
    expect(result.stdout).toMatch(/^git version /);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports a command that fails, with its error output', async () => {
    const result = await runGit({ args: ['no-such-command'], cwd, timeoutMs: 10_000 });

    expect(result.started).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('no-such-command');
  });

  it('does not start when the request was already cancelled', async () => {
    const controller = new AbortController();

    controller.abort();

    expect(await runGit({ args: ['--version'], cwd, timeoutMs: 10_000, signal: controller.signal })).toMatchObject({
      started: false,
      aborted: true,
    });
  });

  it('stops git when the request is cancelled while it runs', async () => {
    const controller = new AbortController();
    const running = runGit({
      args: ['-c', 'alias.wait=!sleep 20', 'wait'],
      cwd,
      timeoutMs: 30_000,
      signal: controller.signal,
    });

    setTimeout(() => controller.abort(), 100);

    const result = await running;

    expect(result).toMatchObject({ started: true, aborted: true, timedOut: false });
    expect(result.durationMs).toBeLessThan(10_000);
  });

  it('stops git that runs for longer than its time limit', async () => {
    const result = await runGit({ args: ['-c', 'alias.wait=!sleep 20', 'wait'], cwd, timeoutMs: 150 });

    expect(result).toMatchObject({ started: true, timedOut: true, aborted: false });
    expect(result.durationMs).toBeLessThan(10_000);
  });

  it('reports that git could not be started', async () => {
    process.env.PATH = '/nonexistent-directory';

    const result = await runGit({ args: ['--version'], cwd, timeoutMs: 10_000 });

    expect(result.started).toBe(false);
    expect(result.spawnError?.code).toBe('ENOENT');
  });

  it('keeps the beginning and the end of a very long output', async () => {
    const result = await runGit({
      args: ['-c', 'alias.big=!yes line | head -n 20000', 'big'],
      cwd,
      timeoutMs: 20_000,
    });

    expect(result.truncated).toBe(true);
    expect(result.stdout).toContain('characters omitted');
  });

  it('does not hand the editor environment to git', async () => {
    process.env.SECRET_TOKEN = 'must not leak';

    const result = await runGit({ args: ['-c', 'alias.env=!env', 'env'], cwd, timeoutMs: 10_000 });

    expect(result.stdout).not.toContain('SECRET_TOKEN');
    expect(result.stdout).toContain('GIT_TERMINAL_PROMPT=0');
    expect(result.stdout).toContain('GIT_PAGER=cat');
  });
});
