import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('../../../tests/support/fake_vscode')).fakeVscode);
vi.mock('../../../../i18n', () => ({ t: (key: string) => key }));

import { PermissionError } from '../../../../permissions';
import { FakeUri, fakeVscode, openFolder } from '../../../tests/support/fake_vscode';
import type { ToolAccessGuard } from '../../../tool_access_guard';
import { MAX_FILES_PER_CALL } from '../batch_file_limits';
import { DeleteFileTool } from '../delete_file_tool';
import { DeleteFilesTool } from '../delete_files_tool';
import { FileVersionTracker } from '../file_version_tracker';
import { MoveFileTool } from '../move_file_tool';
import { MoveFilesTool } from '../move_files_tool';
import { findProtectedTreeEntry } from '../protected_tree_entry';
import { ReadFileTool } from '../read_file_tool';
import { ReadFilesTool } from '../read_files_tool';

const guard = {
  assertReadable: vi.fn(async (..._args: unknown[]) => undefined),
  assertPath: vi.fn(async (..._args: unknown[]) => undefined),
  assertMove: vi.fn(async (..._args: unknown[]) => undefined),
  isProtected: vi.fn((target: string) => path.basename(target) === '.env'),
};

let base: string;
let folder: string;

const asGuard = () => guard as unknown as ToolAccessGuard;
const write = async (relative: string, content = 'x') => {
  await fs.mkdir(path.dirname(path.join(folder, relative)), { recursive: true });
  await fs.writeFile(path.join(folder, relative), content);
};
const exists = (relative: string) =>
  fs.stat(path.join(folder, relative)).then(
    () => true,
    () => false,
  );

describe('file tools that change the tree', () => {
  beforeEach(async () => {
    base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bezotcorp-changes-')));
    folder = path.join(base, 'ws');
    await fs.mkdir(folder);
    openFolder(folder);
    for (const mock of Object.values(guard)) {
      mock.mockClear();
    }
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  describe('delete_file', () => {
    it('removes a file, after asking the guard for a deletion of that exact path', async () => {
      await write('a.txt');

      const result = await new DeleteFileTool(asGuard()).execute({ path: 'a.txt' });

      expect(result).toMatchObject({ status: 'success', details: { wasDirectory: false } });
      expect(await exists('a.txt')).toBe(false);
      expect(guard.assertPath.mock.calls[0]?.[1]).toBe('delete');
      expect(guard.assertPath.mock.calls[0]?.[4]).toMatchObject({ effects: [`removal:${path.join(folder, 'a.txt')}`] });
    });

    it('removes a folder with what it contains', async () => {
      await write('dir/inner/a.txt');

      const result = await new DeleteFileTool(asGuard()).execute({ path: 'dir' });

      expect(result.details).toMatchObject({ wasDirectory: true });
      expect(await exists('dir')).toBe(false);
    });

    it('tells the guard about a protected file below a folder that is not protected itself', async () => {
      await write('dir/sub/.env');

      await new DeleteFileTool(asGuard()).execute({ path: 'dir' });

      expect(guard.assertPath.mock.calls[0]?.[4]).toMatchObject({
        protectedDescendant: path.join(folder, 'dir', 'sub', '.env'),
      });
    });

    it('does not search inside a folder that is protected as a whole', async () => {
      await write('.env/inner.txt');

      await new DeleteFileTool(asGuard()).execute({ path: '.env' });

      expect(guard.assertPath.mock.calls[0]?.[4]).toMatchObject({ protectedDescendant: undefined });
    });

    it('refuses a file or a folder with unsaved changes, and touches nothing', async () => {
      await write('dir/a.txt');
      fakeVscode.workspace.textDocuments = [
        { uri: FakeUri.file(path.join(folder, 'dir', 'a.txt')), isDirty: true, getText: () => '' },
      ];

      expect(await new DeleteFileTool(asGuard()).execute({ path: 'dir' })).toMatchObject({
        reason: 'unsaved_changes',
        executed: false,
      });
      expect(await exists('dir/a.txt')).toBe(true);
    });

    it('deletes nothing when the guard refuses', async () => {
      await write('a.txt');
      guard.assertPath.mockRejectedValueOnce(new PermissionError('user_refused', 'user_refused', 'no'));

      await expect(new DeleteFileTool(asGuard()).execute({ path: 'a.txt' })).rejects.toBeInstanceOf(PermissionError);
      expect(await exists('a.txt')).toBe(true);
    });
  });

  describe('move_file', () => {
    it('moves a file, asking the guard about the move', async () => {
      await write('a.txt', 'content');

      const result = await new MoveFileTool(asGuard())
        .execute({ from: 'a.txt', to: 'sub/b.txt' })
        .catch((error) => error);

      // The destination folder does not exist yet: the move fails and the source stays where it was.
      expect(result).toBeInstanceOf(Error);
      expect(await exists('a.txt')).toBe(true);
      expect(guard.assertMove).toHaveBeenCalledTimes(1);
    });

    it('moves and renames inside an existing folder', async () => {
      await write('a.txt', 'content');
      await fs.mkdir(path.join(folder, 'sub'));

      const result = await new MoveFileTool(asGuard()).execute({ from: 'a.txt', to: 'sub/b.txt' });

      expect(result).toMatchObject({
        status: 'success',
        resource: `${path.join(folder, 'a.txt')} -> ${path.join(folder, 'sub', 'b.txt')}`,
      });
      expect(await fs.readFile(path.join(folder, 'sub', 'b.txt'), 'utf8')).toBe('content');
      expect(await exists('a.txt')).toBe(false);
    });

    it('never overwrites an existing destination', async () => {
      await write('a.txt', 'one');
      await write('b.txt', 'two');

      await expect(new MoveFileTool(asGuard()).execute({ from: 'a.txt', to: 'b.txt' })).rejects.toMatchObject({
        code: 'FileExists',
      });
      expect(await fs.readFile(path.join(folder, 'b.txt'), 'utf8')).toBe('two');
    });

    it('refuses a source with unsaved changes', async () => {
      await write('a.txt');
      fakeVscode.workspace.textDocuments = [
        { uri: FakeUri.file(path.join(folder, 'a.txt')), isDirty: true, getText: () => '' },
      ];

      expect(await new MoveFileTool(asGuard()).execute({ from: 'a.txt', to: 'b.txt' })).toMatchObject({
        reason: 'unsaved_changes',
      });
      expect(guard.assertMove).not.toHaveBeenCalled();
    });

    it('tells the guard about a protected file the move would reveal or hide, by its destination path', async () => {
      await write('dir/.env');

      await new MoveFileTool(asGuard()).execute({ from: 'dir', to: 'moved' });

      expect(guard.assertMove.mock.calls[0]?.[4]).toMatchObject({
        protectedDescendant: path.join(folder, 'moved', '.env'),
      });
    });
  });

  describe('findProtectedTreeEntry', () => {
    const isProtected = (target: string) => path.basename(target) === '.env';
    const root = () => FakeUri.file(path.join(folder, 'tree')) as never;

    it('finds the first protected file in a nested tree', async () => {
      await write('tree/a/b/.env');
      await write('tree/c.txt');

      const found = await findProtectedTreeEntry(root(), isProtected);

      expect(found?.source.fsPath).toBe(path.join(folder, 'tree', 'a', 'b', '.env'));
      expect(found?.isDirectory).toBe(false);
      expect(found?.destination).toBeUndefined();
    });

    it('finds a protected folder as such', async () => {
      await write('tree/.env/inner.txt');

      expect((await findProtectedTreeEntry(root(), isProtected))?.isDirectory).toBe(true);
    });

    it('also looks at the corresponding destination path', async () => {
      await write('tree/a/.keep');

      const found = await findProtectedTreeEntry(
        root(),
        (target) => target.endsWith(path.join('dest', 'a', '.keep')),
        undefined,
        FakeUri.file(path.join(folder, 'dest')) as never,
      );

      expect(found?.source.fsPath).toBe(path.join(folder, 'tree', 'a', '.keep'));
      expect(found?.destination?.fsPath).toBe(path.join(folder, 'dest', 'a', '.keep'));
    });

    it('finds nothing in a clean tree', async () => {
      await write('tree/a/b.txt');

      expect(await findProtectedTreeEntry(root(), isProtected)).toBeUndefined();
    });

    it('does not go through a symbolic link to a folder', async () => {
      await write('outside/.env');
      await fs.mkdir(path.join(folder, 'tree'));
      await fs.symlink(path.join(folder, 'outside'), path.join(folder, 'tree', 'link'));

      expect(await findProtectedTreeEntry(root(), isProtected)).toBeUndefined();
    });

    it('stops when the request is cancelled', async () => {
      await write('tree/a.txt');

      const controller = new AbortController();

      controller.abort();

      await expect(findProtectedTreeEntry(root(), isProtected, controller.signal)).rejects.toThrow(
        'Generation aborted',
      );
    });
  });

  describe('plural tools', () => {
    const versions = () => new FileVersionTracker();
    const readMany = () => new ReadFilesTool(new ReadFileTool(asGuard(), versions()));

    it('takes the identity and the permission of the singular tool', () => {
      const tool = new DeleteFilesTool(new DeleteFileTool(asGuard()));

      expect(tool).toMatchObject({
        id: 'delete_files',
        permissionKey: 'delete_file',
        permissionDefault: 'ask',
        readOnlyCompatible: false,
        editsFiles: true,
      });
      expect(new MoveFilesTool(new MoveFileTool(asGuard())).permissionKey).toBe('move_file');
    });

    it('runs each item through the singular tool, in order, and succeeds when all succeed', async () => {
      await write('a.txt', 'AAA');
      await write('b.txt', 'BBB');

      const result = await readMany().execute({ files: [{ path: 'a.txt' }, { path: 'b.txt' }] });
      const results = (result.details as { results: { content: string }[] }).results;

      expect(result).toMatchObject({ status: 'success', message: '2 of 2 succeeded.' });
      expect(results.map((item) => item.content)).toEqual(['AAA', 'BBB']);
    });

    it('accepts the list as a JSON string', async () => {
      await write('a.txt');

      expect((await readMany().execute({ files: '[{"path":"a.txt"}]' })).status).toBe('success');
    });

    it('refuses an empty list, a list that is too long, and a value that is not a list', async () => {
      for (const files of [[], Array.from({ length: MAX_FILES_PER_CALL + 1 }, () => ({ path: 'a' })), 'nope', 3]) {
        expect(await readMany().execute({ files })).toMatchObject({ reason: 'invalid_arguments', executed: false });
      }
    });

    it('does not stop at an item that fails, and reports a partial failure with each outcome', async () => {
      await write('a.txt');

      const result = await readMany().execute({ files: [{ path: 'missing.txt' }, { path: 'a.txt' }] });

      expect(result).toMatchObject({
        status: 'error',
        reason: 'partial_failure',
        executed: true,
        retryable: true,
        details: { total: 2, succeeded: 1, failed: 1 },
      });
      expect((result.details as { results: { reason?: string }[] }).results[0]?.reason).toBe('not_found');
    });

    it('reports that every item failed', async () => {
      const result = await readMany().execute({ files: [{ path: 'x.txt' }, { path: 'y.txt' }] });

      expect(result).toMatchObject({ status: 'error', reason: 'all_failed', executed: false });
    });

    it('refuses an item whose arguments are invalid without running it', async () => {
      await write('a.txt');

      const result = await readMany().execute({ files: [{ nothing: 1 }, { path: 'a.txt' }] });
      const results = (result.details as { results: { reason?: string }[] }).results;

      expect(results[0]?.reason).toBe('invalid_arguments');
      expect(result.reason).toBe('partial_failure');
    });

    it('turns a refusal in one item into a denied outcome for that item only', async () => {
      await write('a.txt');
      await write('b.txt');
      guard.assertReadable.mockRejectedValueOnce(new PermissionError('user_refused', 'user_refused', 'no'));

      const result = await readMany().execute({ files: [{ path: 'a.txt' }, { path: 'b.txt' }] });
      const results = (result.details as { results: { status: string }[] }).results;

      expect(results.map((item) => item.status)).toEqual(['denied', 'success']);
    });

    it('makes the whole call uncertain when one item is uncertain', async () => {
      const single = new ReadFileTool(asGuard(), versions());

      vi.spyOn(single, 'execute').mockResolvedValueOnce({
        status: 'unknown',
        operation: 'read_file',
        executed: 'unknown',
        retryable: false,
      });

      const result = await new ReadFilesTool(single).execute({ files: [{ path: 'a.txt' }] });

      expect(result).toMatchObject({ status: 'unknown', executed: 'unknown' });
    });

    it('does not start the items left once the request is cancelled', async () => {
      await write('a.txt');

      const controller = new AbortController();

      controller.abort();

      const result = await readMany().execute({ files: [{ path: 'a.txt' }] }, { signal: controller.signal });

      expect((result.details as { results: { status: string }[] }).results[0]?.status).toBe('cancelled');
    });

    it('gives each item a share of the size limit so that the whole result fits', async () => {
      await write('a.txt', 'x'.repeat(5_000));
      await write('b.txt', 'y'.repeat(5_000));

      const result = await readMany().execute(
        { files: [{ path: 'a.txt' }, { path: 'b.txt' }] },
        { maxResultChars: 3_000 },
      );

      expect(JSON.stringify(result).length).toBeLessThanOrEqual(3_000);
    });
  });
});
