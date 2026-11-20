import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('../../../tests/support/fake_vscode')).fakeVscode);
vi.mock('../../../../i18n', () => ({
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

import { PermissionError } from '../../../../permissions';
import { FakeUri, fakeVscode, openFolder } from '../../../tests/support/fake_vscode';
import type { ToolAccessGuard } from '../../../tool_access_guard';
import type { ToolExecutionResult } from '../../../tool_execution_result';
import {
  GitAddTool,
  GitBranchCreateTool,
  GitBranchListTool,
  GitCommitTool,
  GitDiffTool,
  GitFetchTool,
  GitLogTool,
  GitPullTool,
  GitPushTool,
  GitShowTool,
  GitStatusTool,
  GitSwitchTool,
  GitUnstageTool,
} from '..';

const guard = { authorize: vi.fn(async (..._args: unknown[]) => undefined) };
const asGuard = () => guard as unknown as ToolAccessGuard;
const saved = { ...process.env };

let base: string;
let repo: string;

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } });
const write = (name: string, content: string) => fs.writeFile(path.join(repo, name), content);
const authorized = () =>
  guard.authorize.mock.calls[0]?.[0] as {
    action: string;
    actionLabel: string;
    detail?: string;
    resources: { path: string }[];
  };
const content = (result: ToolExecutionResult) => result.content ?? '';

describe('git tools', () => {
  beforeEach(async () => {
    base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bezotcorp-git-')));
    repo = path.join(base, 'repo');
    await fs.mkdir(repo);
    process.env.GIT_CONFIG_GLOBAL = '/dev/null';
    process.env.GIT_CONFIG_SYSTEM = '/dev/null';
    process.env.GIT_AUTHOR_NAME = 'Test';
    process.env.GIT_AUTHOR_EMAIL = 'test@example.com';
    process.env.GIT_COMMITTER_NAME = 'Test';
    process.env.GIT_COMMITTER_EMAIL = 'test@example.com';
    git('init', '-q', '-b', 'main');
    await write('a.txt', 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'first commit');
    openFolder(repo);
    guard.authorize.mockClear();
  });

  afterEach(async () => {
    process.env = { ...saved };
    await fs.rm(base, { recursive: true, force: true });
  });

  describe('reading', () => {
    it('shows the branch and the changed, staged and untracked files, without asking', async () => {
      await write('a.txt', 'changed\n');
      await write('new.txt', 'x');

      const result = await new GitStatusTool(asGuard()).execute({});

      expect(result.status).toBe('success');
      expect(content(result)).toContain('## main');
      expect(content(result)).toContain(' M a.txt');
      expect(content(result)).toContain('?? new.txt');
      expect(result.details).toMatchObject({ command: 'status', exitCode: 0 });
    });

    it('asks the guard for the permission of every command, with the paths it touches', async () => {
      await new GitStatusTool(asGuard()).execute({});

      expect(authorized().action).toBe(`run Git Status in ${repo}`);
      expect(authorized().resources).toEqual([]);
    });

    it('lists commits, for a revision and a number', async () => {
      await write('a.txt', 'two\n');
      git('commit', '-q', '-am', 'second commit');

      const result = await new GitLogTool(asGuard()).execute({ maxCount: 1 });

      expect(content(result)).toContain('second commit');
      expect(content(result)).not.toContain('first commit');
      expect(content(await new GitLogTool(asGuard()).execute({ revision: 'HEAD~1' }))).toContain('first commit');
    });

    it('limits the log to some paths, which it announces to the guard', async () => {
      const result = await new GitLogTool(asGuard()).execute({ paths: ['a.txt'] });

      expect(content(result)).toContain('first commit');
      expect(authorized().resources.map((resource) => resource.path)).toEqual([path.join(repo, 'a.txt')]);
    });

    it('refuses a log count out of range and a revision that is not one', async () => {
      expect(await new GitLogTool(asGuard()).execute({ maxCount: 500 })).toMatchObject({ reason: 'invalid_arguments' });
      expect(await new GitLogTool(asGuard()).execute({ revision: '--all' })).toMatchObject({
        reason: 'invalid_arguments',
      });
      expect(guard.authorize).not.toHaveBeenCalled();
    });

    it('shows the unstaged, staged and statistical diff', async () => {
      await write('a.txt', 'changed\n');

      expect(content(await new GitDiffTool(asGuard()).execute({}))).toContain('+changed');
      expect(content(await new GitDiffTool(asGuard()).execute({ staged: true }))).toBe('');

      git('add', 'a.txt');

      expect(content(await new GitDiffTool(asGuard()).execute({ staged: true }))).toContain('+changed');
      expect(content(await new GitDiffTool(asGuard()).execute({ staged: true, stat: true }))).toContain(
        '1 file changed',
      );
      expect(content(await new GitDiffTool(asGuard()).execute({ revision: 'HEAD' }))).toContain('+changed');
    });

    it('refuses a diff for a revision that could read a file or be an option', async () => {
      expect(await new GitDiffTool(asGuard()).execute({ revision: 'HEAD:a.txt' })).toMatchObject({
        reason: 'invalid_arguments',
      });
      expect(await new GitDiffTool(asGuard()).execute({ paths: ['../x'] })).toMatchObject({
        reason: 'invalid_arguments',
      });
    });

    it('shows one commit', async () => {
      const result = await new GitShowTool(asGuard()).execute({ revision: 'HEAD' });

      expect(content(result)).toContain('first commit');
      expect(content(result)).toContain('+one');
      expect(await new GitShowTool(asGuard()).execute({})).toMatchObject({ reason: 'invalid_arguments' });
      expect(await new GitShowTool(asGuard()).execute({ revision: 'a b' })).toMatchObject({
        reason: 'invalid_arguments',
      });
    });

    it('lists the branches', async () => {
      git('branch', 'other');

      const result = await new GitBranchListTool(asGuard()).execute({});

      expect(content(result)).toContain('main');
      expect(content(result)).toContain('other');
    });
  });

  describe('changing', () => {
    it('stages the given files, after asking with their paths, and unstages them', async () => {
      await write('b.txt', 'b');

      const added = await new GitAddTool(asGuard()).execute({ paths: ['b.txt'] });

      expect(added).toMatchObject({ status: 'success', message: 'git finished without output.' });
      expect(authorized().action).toBe('stage 1 path(s) with git');
      expect(authorized().detail).toBe(path.join(repo, 'b.txt'));
      expect(git('status', '--porcelain')).toContain('A  b.txt');

      guard.authorize.mockClear();

      expect((await new GitUnstageTool(asGuard()).execute({ paths: ['b.txt'] })).status).toBe('success');
      expect(authorized().action).toBe('unstage 1 path(s) with git');
      expect(git('status', '--porcelain')).toContain('?? b.txt');
    });

    it('never stages everything: paths are required and must be in the repository', async () => {
      expect(await new GitAddTool(asGuard()).execute({})).toMatchObject({ reason: 'invalid_arguments' });
      expect(await new GitAddTool(asGuard()).execute({ paths: ['../outside'] })).toMatchObject({
        reason: 'invalid_arguments',
      });
      expect(await new GitUnstageTool(asGuard()).execute({})).toMatchObject({ reason: 'invalid_arguments' });
      expect(guard.authorize).not.toHaveBeenCalled();
    });

    it('commits what is staged, showing the user the message and the staged files first', async () => {
      await write('b.txt', 'b');
      git('add', 'b.txt');

      const result = await new GitCommitTool(asGuard()).execute({ message: '  add b  ' });

      expect(result.status).toBe('success');
      expect(authorized().detail).toContain('"message":"add b"');
      expect(authorized().detail).toContain('b.txt');
      expect(git('log', '-1', '--format=%s').trim()).toBe('add b');
    });

    it('does not commit when nothing is staged, and does not even ask', async () => {
      const result = await new GitCommitTool(asGuard()).execute({ message: 'nothing' });

      expect(result).toMatchObject({ reason: 'invalid_arguments' });
      expect(result.message).toContain('Nothing is staged');
      expect(guard.authorize).not.toHaveBeenCalled();
    });

    it('refuses an empty commit message', async () => {
      expect(await new GitCommitTool(asGuard()).execute({ message: '  ' })).toMatchObject({
        reason: 'invalid_arguments',
      });
    });

    it('creates a branch without switching to it, then switches to it', async () => {
      expect((await new GitBranchCreateTool(asGuard()).execute({ name: 'feature/x' })).status).toBe('success');
      expect(git('branch', '--show-current').trim()).toBe('main');
      expect(authorized().action).toBe('create the git branch feature/x');

      expect((await new GitSwitchTool(asGuard()).execute({ branch: 'feature/x' })).status).toBe('success');
      expect(git('branch', '--show-current').trim()).toBe('feature/x');
    });

    it('creates a branch from a revision', async () => {
      await write('a.txt', 'two\n');
      git('commit', '-q', '-am', 'second');

      await new GitBranchCreateTool(asGuard()).execute({ name: 'old', startPoint: 'HEAD~1' });

      expect(git('rev-parse', 'old')).toBe(git('rev-parse', 'HEAD~1'));
    });

    it('refuses invalid branch names and a missing one', async () => {
      for (const tool of [new GitBranchCreateTool(asGuard()), new GitSwitchTool(asGuard())]) {
        expect(await tool.execute({})).toMatchObject({ reason: 'invalid_arguments' });
      }

      expect(await new GitBranchCreateTool(asGuard()).execute({ name: '-D' })).toMatchObject({
        reason: 'invalid_arguments',
      });
      expect(await new GitSwitchTool(asGuard()).execute({ branch: 'a..b' })).toMatchObject({
        reason: 'invalid_arguments',
      });
      expect(await new GitBranchCreateTool(asGuard()).execute({ name: 'ok', startPoint: '-x' })).toMatchObject({
        reason: 'invalid_arguments',
      });
    });

    it('reports what git said when a command fails', async () => {
      const result = await new GitSwitchTool(asGuard()).execute({ branch: 'missing' });

      expect(result).toMatchObject({ status: 'error', reason: 'git_failed', executed: true, retryable: false });
      expect(result.message).toContain('exited with code');
      expect(content(result)).toContain('missing');
    });

    it('words the remote operations, and refuses a remote that is not a name', async () => {
      git('remote', 'add', 'origin', path.join(base, 'does-not-exist.git'));

      const push = await new GitPushTool(asGuard()).execute({ setUpstream: true });

      expect(push).toMatchObject({ status: 'error', reason: 'git_failed' });
      expect(authorized().action).toBe('push the current branch to the git remote origin');

      guard.authorize.mockClear();

      expect((await new GitFetchTool(asGuard()).execute({})).status).toBe('error');
      expect((await new GitPullTool(asGuard()).execute({ branch: 'main' })).status).toBe('error');
      expect(authorized().action).toContain('origin');

      for (const tool of [new GitPushTool(asGuard()), new GitFetchTool(asGuard()), new GitPullTool(asGuard())]) {
        expect(await tool.execute({ remote: 'https://example.com/x.git' })).toMatchObject({
          reason: 'invalid_arguments',
        });
      }
    });

    it('pushes to a remote, and fast-forwards from it', async () => {
      const remote = path.join(base, 'remote.git');

      git('init', '-q', '--bare', '-b', 'main', remote);
      git('remote', 'add', 'origin', remote);

      expect((await new GitPushTool(asGuard()).execute({ setUpstream: true, branch: 'main' })).status).toBe('success');
      expect(execFileSync('git', ['rev-parse', 'main'], { cwd: remote, encoding: 'utf8' })).toBe(
        git('rev-parse', 'main'),
      );
      expect((await new GitFetchTool(asGuard()).execute({})).status).toBe('success');
      expect((await new GitPullTool(asGuard()).execute({})).status).toBe('success');
    });

    it('does not run when the guard refuses', async () => {
      await write('b.txt', 'b');
      guard.authorize.mockRejectedValueOnce(new PermissionError('user_refused', 'user_refused', 'no'));

      await expect(new GitAddTool(asGuard()).execute({ paths: ['b.txt'] })).rejects.toBeInstanceOf(PermissionError);
      expect(git('status', '--porcelain')).toContain('?? b.txt');
    });
  });

  describe('what a git tool needs around it', () => {
    it('requires a trusted workspace, and a tool that only reads still works in read-only mode', () => {
      const status = new GitStatusTool(asGuard());

      expect(status.requiresTrust).toBe(true);
      expect(status).toMatchObject({ readOnlyCompatible: true, permissionDefault: 'allow' });
      expect(new GitCommitTool(asGuard())).toMatchObject({ readOnlyCompatible: false, permissionDefault: 'ask' });
    });

    it('needs a workspace folder', async () => {
      fakeVscode.workspace.workspaceFolders = undefined;

      expect(await new GitStatusTool(asGuard()).execute({})).toMatchObject({ reason: 'no_workspace', executed: false });
    });

    it('needs a folder backed by the filesystem', async () => {
      fakeVscode.workspace.workspaceFolders = [
        { uri: new FakeUri('vscode-vfs', 'github', '/o/r'), name: 'r', index: 0 },
      ];

      expect(await new GitStatusTool(asGuard()).execute({})).toMatchObject({ reason: 'git_requires_filesystem' });
    });

    it('chooses the folder by its name, and says which folders are open when it is unknown', async () => {
      const other = path.join(base, 'other');

      await fs.mkdir(other);
      fakeVscode.workspace.workspaceFolders = [
        { uri: FakeUri.file(repo), name: 'repo', index: 0 },
        { uri: FakeUri.file(other), name: 'other', index: 1 },
      ];

      expect((await new GitStatusTool(asGuard()).execute({ folder: 'repo' })).status).toBe('success');
      expect(await new GitStatusTool(asGuard()).execute({ folder: 'other' })).toMatchObject({
        reason: 'not_a_git_repository',
        executed: false,
      });

      const unknown = await new GitStatusTool(asGuard()).execute({ folder: 'nope' });

      expect(unknown).toMatchObject({ reason: 'unknown_folder', retryable: true });
      expect(unknown.message).toContain('Open folders: repo, other.');
    });

    it('tells that the folder is not a git repository', async () => {
      const plain = path.join(base, 'plain');

      await fs.mkdir(plain);
      openFolder(plain);

      const result = await new GitStatusTool(asGuard()).execute({});

      expect(result).toMatchObject({ status: 'error', reason: 'not_a_git_repository', executed: false });
      expect(result.message).toBe('The workspace folder is not a git repository.');
    });

    it('tells that git is not installed', async () => {
      process.env.PATH = '/nonexistent-directory';

      expect(await new GitStatusTool(asGuard()).execute({})).toMatchObject({
        reason: 'git_not_found',
        retryable: false,
      });
    });

    it('does not start git when the request was cancelled, and says nothing ran', async () => {
      const controller = new AbortController();

      controller.abort();

      expect(await new GitStatusTool(asGuard()).execute({}, { signal: controller.signal })).toMatchObject({
        status: 'cancelled',
        reason: 'cancelled_by_user',
        executed: false,
      });
    });
  });
});
