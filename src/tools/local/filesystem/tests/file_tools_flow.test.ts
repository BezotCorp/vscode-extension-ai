import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('../../../tests/support/fake_vscode')).fakeVscode);
vi.mock('../../../../i18n', () => ({ t: (key: string) => key }));

import { sha256Hex } from '../../../../workspace';
import { FakeUri, fakeVscode, openFolder } from '../../../tests/support/fake_vscode';
import type { ToolAccessGuard } from '../../../tool_access_guard';
import type { ToolExecutionResult } from '../../../tool_execution_result';
import { CreateFileTool } from '../create_file_tool';
import { FileToolServices } from '../file_tool_services';
import { FileVersionTracker } from '../file_version_tracker';
import { ReadFileTool } from '../read_file_tool';
import { UpdateFileTool } from '../update_file_tool';

const guard = {
  assertReadable: async () => undefined,
  assertPath: async () => undefined,
} as unknown as ToolAccessGuard;

let folder: string;
let storage: string;
let services: FileToolServices;

// What one generation holds: its own tracker and the tools that share it.
function generation() {
  const versions = new FileVersionTracker();
  const read = new ReadFileTool(guard, versions);
  const update = new UpdateFileTool(guard, read, versions, services.writes);
  const create = new CreateFileTool(guard, versions);

  return { versions, read, update, create };
}

const content = (result: ToolExecutionResult) => (result as { content?: string }).content;
const onDisk = (name: string) => fs.readFile(path.join(folder, name), 'utf8');

describe('file tools across generations', () => {
  beforeEach(async () => {
    const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bezotcorp-tools-')));

    folder = path.join(base, 'ws');
    storage = path.join(base, 'storage');
    await fs.mkdir(folder);
    await fs.writeFile(path.join(folder, 'update-me.txt'), 'alpha\nbeta\ngamma\n');
    openFolder(folder);
    services = new FileToolServices(storage);
  });

  afterEach(async () => {
    services.dispose();
    await fs.rm(path.dirname(folder), { recursive: true, force: true });
  });

  describe('within one generation', () => {
    it('chains several edits after a single read, as the tracker is refreshed after each write', async () => {
      const { read, update } = generation();

      expect((await read.execute({ path: 'update-me.txt' })).status).toBe('success');

      for (const [from, to] of [
        ['beta', 'BETA'],
        ['BETA', 'beta'],
        ['beta', 'BETA'],
      ]) {
        const result = await update.execute({ path: 'update-me.txt', old_text: from, new_text: to });

        expect(result).toMatchObject({ status: 'success', details: { verified: true } });
      }

      expect(await onDisk('update-me.txt')).toBe('alpha\nBETA\ngamma\n');
    });

    it('edits a file it created without reading it', async () => {
      const { create, update } = generation();

      await create.execute({ path: 'new.txt', content: 'one\ntwo\n' });

      const result = await update.execute({ path: 'new.txt', old_text: 'two', new_text: 'TWO' });

      expect(result.status).toBe('success');
      expect(await onDisk('new.txt')).toBe('one\nTWO\n');
    });

    it('refuses to create a file that already exists', async () => {
      const { create } = generation();

      await expect(create.execute({ path: 'update-me.txt', content: 'x' })).rejects.toThrow();
      expect(await onDisk('update-me.txt')).toBe('alpha\nbeta\ngamma\n');
    });
  });

  describe('between generations, where the tracker is new', () => {
    it('refuses an edit made without reading, even though the file is unchanged, and writes nothing', async () => {
      const first = generation();

      await first.read.execute({ path: 'update-me.txt' });

      const second = generation();
      const result = await second.update.execute({ path: 'update-me.txt', old_text: 'beta', new_text: 'BETA' });

      expect(result).toMatchObject({ status: 'error', reason: 'file_changed', executed: false, retryable: true });
      expect(result.message).toContain('You had not read the current version');
      expect(content(result)).toBe('alpha\nbeta\ngamma\n');
      expect(await onDisk('update-me.txt')).toBe('alpha\nbeta\ngamma\n');
    });

    it('lets the retry succeed, since the refusal handed the current content over', async () => {
      const { update } = generation();

      const refused = await update.execute({ path: 'update-me.txt', old_text: 'beta', new_text: 'BETA' });
      const retried = await update.execute({ path: 'update-me.txt', old_text: 'beta', new_text: 'BETA' });

      expect(refused.reason).toBe('file_changed');
      expect(retried.status).toBe('success');
      expect(await onDisk('update-me.txt')).toBe('alpha\nBETA\ngamma\n');
    });

    it('succeeds after a read in the new generation', async () => {
      const { read, update } = generation();

      await read.execute({ path: 'update-me.txt' });

      expect((await update.execute({ path: 'update-me.txt', old_text: 'beta', new_text: 'BETA' })).status).toBe(
        'success',
      );
    });
  });

  describe('when the file changed', () => {
    it('refuses an edit based on a version that is no longer the file', async () => {
      const { read, update } = generation();

      await read.execute({ path: 'update-me.txt' });
      await fs.writeFile(path.join(folder, 'update-me.txt'), 'alpha\nbeta changed elsewhere\ngamma\n');

      const result = await update.execute({ path: 'update-me.txt', old_text: 'gamma', new_text: 'GAMMA' });

      expect(result).toMatchObject({ reason: 'file_changed', retryable: true });
      expect(result.message).toContain('no longer');
      expect(await onDisk('update-me.txt')).toBe('alpha\nbeta changed elsewhere\ngamma\n');
    });

    it('stops for good after the retries allowed, and tells the user', async () => {
      const { update } = generation();
      const attempt = () => update.execute({ path: 'update-me.txt', old_text: 'beta', new_text: 'BETA' });
      // Each attempt is refused because the file keeps being replaced between the refusal and the retry.
      const outcomes: (string | undefined)[] = [];

      for (let index = 0; index < 3; index++) {
        outcomes.push((await attempt()).reason);
        await fs.writeFile(path.join(folder, 'update-me.txt'), `alpha\nbeta\ngamma ${index}\n`);
      }

      expect(outcomes).toEqual(['file_changed', 'file_changed', 'concurrent_modifications']);
      expect(fakeVscode.window.messages).toContain('notify.updateStopped');
    });
  });

  describe('partial views', () => {
    beforeEach(async () => {
      await fs.writeFile(
        path.join(folder, 'long.txt'),
        Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join('\n'),
      );
    });

    it('allows a local edit inside the part that was read', async () => {
      const { read, update } = generation();

      await read.execute({ path: 'long.txt', startLine: 3, endLine: 5 });

      const result = await update.execute({ path: 'long.txt', old_text: 'line 4', new_text: 'LINE 4' });

      expect(result.status).toBe('success');
      expect(await onDisk('long.txt')).toContain('line 3\nLINE 4\nline 5');
    });

    it('refuses an edit outside the part that was read', async () => {
      const { read, update } = generation();

      await read.execute({ path: 'long.txt', startLine: 3, endLine: 5 });

      const result = await update.execute({ path: 'long.txt', old_text: 'line 9', new_text: 'LINE 9' });

      expect(result.reason).toBe('file_changed');
      expect(await onDisk('long.txt')).toContain('line 9');
    });

    it('refuses a whole replacement that rests on a partial view, and says why', async () => {
      const { read, update } = generation();

      await read.execute({ path: 'long.txt', startLine: 1, endLine: 2 });

      const result = await update.execute({ path: 'long.txt', content: 'brand new' });

      expect(result.reason).toBe('file_changed');
      expect(result.message).toContain('does not cover the whole file');
      expect(await onDisk('long.txt')).toContain('line 10');
    });

    it('remembers what the model now knows after an edit inside a part, and allows another there', async () => {
      const { read, update } = generation();

      await read.execute({ path: 'long.txt', startLine: 3, endLine: 5 });
      await update.execute({ path: 'long.txt', old_text: 'line 4', new_text: 'LINE 4' });

      const again = await update.execute({ path: 'long.txt', old_text: 'LINE 4', new_text: 'line 4' });

      expect(again.status).toBe('success');
    });
  });

  describe('observations', () => {
    it('records a whole read with the SHA of the file and no text', async () => {
      const { read, versions } = generation();

      await read.execute({ path: 'update-me.txt' });

      expect(versions.takeObservations()).toEqual([
        {
          path: path.join(folder, 'update-me.txt'),
          sha: sha256Hex(new TextEncoder().encode('alpha\nbeta\ngamma\n')),
          complete: true,
          origin: 'read',
        },
      ]);
    });

    it('records a range read with the SHA of the whole file and the exact text received', async () => {
      const { read, versions } = generation();

      await read.execute({ path: 'update-me.txt', startLine: 2, endLine: 2 });

      expect(versions.takeObservations()).toEqual([
        {
          path: path.join(folder, 'update-me.txt'),
          sha: sha256Hex(new TextEncoder().encode('alpha\nbeta\ngamma\n')),
          complete: false,
          origin: 'read',
          text: 'beta',
        },
      ]);
    });

    it('records the checked write with the SHA of what is now on disk', async () => {
      const { read, update, versions } = generation();

      await read.execute({ path: 'update-me.txt' });
      versions.takeObservations();
      await update.execute({ path: 'update-me.txt', old_text: 'beta', new_text: 'BETA' });

      expect(versions.takeObservations()).toEqual([
        {
          path: path.join(folder, 'update-me.txt'),
          sha: sha256Hex(new TextEncoder().encode('alpha\nBETA\ngamma\n')),
          complete: true,
          origin: 'written',
        },
      ]);
    });

    it('records the content handed back by a refusal, and a created file', async () => {
      const { update, create, versions } = generation();

      await update.execute({ path: 'update-me.txt', old_text: 'beta', new_text: 'BETA' });
      await create.execute({ path: 'new.txt', content: 'x' });

      expect(versions.takeObservations().map((observation) => observation.origin)).toEqual(['conflict', 'created']);
    });

    it('records nothing for a file that was not read, or whose read failed', async () => {
      const { read, versions } = generation();

      await read.execute({ path: 'missing.txt' });

      expect(versions.takeObservations()).toEqual([]);
    });
  });

  describe('files with unsaved changes in the editor', () => {
    beforeEach(() => {
      fakeVscode.workspace.textDocuments = [
        {
          uri: FakeUri.file(path.join(folder, 'update-me.txt')),
          isDirty: true,
          getText: () => 'edited in the editor\n',
        },
      ];
    });

    it('reads the editor content, and remembers nothing since it is not on the filesystem', async () => {
      const { read, versions } = generation();
      const result = await read.execute({ path: 'update-me.txt' });

      expect(content(result)).toBe('edited in the editor\n');
      expect(result.details).toMatchObject({ source: 'editor_buffer', unsavedChanges: true });
      expect(versions.takeObservations()).toEqual([]);
      expect(versions.hasSeen(path.join(folder, 'update-me.txt'))).toBe(false);
    });

    it('refuses to update such a file and leaves it alone', async () => {
      const { update } = generation();
      const result = await update.execute({ path: 'update-me.txt', old_text: 'beta', new_text: 'BETA' });

      expect(result).toMatchObject({ reason: 'unsaved_changes', executed: false });
      expect(await onDisk('update-me.txt')).toBe('alpha\nbeta\ngamma\n');
    });
  });

  describe('invalid requests', () => {
    it('refuses arguments that are neither an edit nor a whole content, or both', async () => {
      const { update } = generation();

      for (const input of [
        { path: 'update-me.txt' },
        { path: 'update-me.txt', old_text: 'a', new_text: 'b', content: 'c' },
        { path: 'update-me.txt', old_text: '', new_text: 'b' },
        { path: 'update-me.txt', old_text: 'a' },
        { path: 'update-me.txt', content: 3 },
      ]) {
        expect(await update.execute(input)).toMatchObject({ reason: 'invalid_arguments', executed: false });
      }
    });

    it('refuses a directory, and a missing or binary file', async () => {
      const { read, update } = generation();

      await fs.mkdir(path.join(folder, 'dir'));
      await fs.writeFile(path.join(folder, 'bin.dat'), Buffer.from([1, 2, 0, 3]));

      expect(await update.execute({ path: 'dir', old_text: 'a', new_text: 'b' })).toMatchObject({
        reason: 'is_a_directory',
      });
      expect(await read.execute({ path: 'dir' })).toMatchObject({ reason: 'is_a_directory' });
      expect(await read.execute({ path: 'missing.txt' })).toMatchObject({ reason: 'not_found' });
      expect(await read.execute({ path: 'bin.dat' })).toMatchObject({ reason: 'binary_file' });
      expect(await update.execute({ path: 'bin.dat', old_text: 'a', new_text: 'b' })).toMatchObject({
        reason: 'binary_file',
      });
    });

    it('refuses an invalid line range', async () => {
      const { read } = generation();

      expect(await read.execute({ path: 'update-me.txt', startLine: 5, endLine: 2 })).toMatchObject({
        reason: 'invalid_range',
      });
    });

    it('refuses an edit that changes nothing, or a text that is not in the file', async () => {
      const { read, update } = generation();

      await read.execute({ path: 'update-me.txt' });

      expect(await update.execute({ path: 'update-me.txt', old_text: 'beta', new_text: 'beta' })).toMatchObject({
        reason: 'no_change',
      });
      expect(await update.execute({ path: 'update-me.txt', old_text: 'zzz', new_text: 'y' })).toMatchObject({
        reason: 'old_text_not_found',
      });
      expect(await update.execute({ path: 'update-me.txt', content: 'alpha\nbeta\ngamma\n' })).toMatchObject({
        reason: 'no_change',
      });
    });
  });

  describe('a whole replacement', () => {
    it('replaces the file after a whole read', async () => {
      const { read, update } = generation();

      await read.execute({ path: 'update-me.txt' });

      expect((await update.execute({ path: 'update-me.txt', content: 'new content\n' })).status).toBe('success');
      expect(await onDisk('update-me.txt')).toBe('new content\n');
      expect(await fs.readdir(path.join(storage, 'write-backups'))).toEqual([]);
    });
  });

  describe('when the write itself goes wrong', () => {
    const original = 'alpha\nbeta\ngamma\n';

    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function readThenEdit() {
      const { read, update } = generation();

      await read.execute({ path: 'update-me.txt' });

      return update.execute({ path: 'update-me.txt', old_text: 'beta', new_text: 'BETA' });
    }

    it('writes nothing and says so when the safety copy cannot be made', async () => {
      await fs.mkdir(storage, { recursive: true });
      await fs.writeFile(path.join(storage, 'write-backups'), 'a file where the folder should be');

      expect(await readThenEdit()).toMatchObject({
        status: 'error',
        reason: 'backup_failed',
        executed: false,
        retryable: true,
      });
      expect(await onDisk('update-me.txt')).toBe(original);
    });

    it('restores the original and says so when the write fails', async () => {
      vi.spyOn(fakeVscode.workspace.fs, 'writeFile').mockRejectedValueOnce(new Error('disk full'));

      const result = await readThenEdit();

      expect(result).toMatchObject({ status: 'error', reason: 'write_failed', executed: true, retryable: true });
      expect(result.message).toContain('disk full');
      expect(await onDisk('update-me.txt')).toBe(original);
    });

    it('restores the original when what was written is not what was intended', async () => {
      const real = fakeVscode.workspace.fs.writeFile;

      vi.spyOn(fakeVscode.workspace.fs, 'writeFile').mockImplementationOnce(async (file) =>
        real(file, new TextEncoder().encode('corrupted')),
      );

      expect(await readThenEdit()).toMatchObject({ reason: 'integrity_check_failed', executed: true, retryable: true });
      expect(await onDisk('update-me.txt')).toBe(original);
    });

    it('tells the user where the safety copy is, and the model not to write again, when the original cannot be restored', async () => {
      vi.spyOn(fakeVscode.workspace.fs, 'writeFile').mockRejectedValue(new Error('read-only'));

      const result = await readThenEdit();

      expect(result).toMatchObject({ reason: 'restore_failed', executed: true, retryable: false });
      expect(result.message).toContain('Do not write to this file again');
      expect(fakeVscode.window.messages).toContain('notify.writeNotRestored');
    });

    it('treats a file that changed while the write was being prepared as any other conflict, and hands the content back', async () => {
      const real = fakeVscode.workspace.fs.readFile;
      let reads = 0;

      vi.spyOn(fakeVscode.workspace.fs, 'readFile').mockImplementation(async (file) => {
        reads++;

        // The third read is the pipeline's own: someone else changes the file just before it.
        if (reads === 3) {
          await fs.writeFile(path.join(folder, 'update-me.txt'), 'alpha\nbeta\nchanged meanwhile\n');
        }

        return real(file);
      });

      const result = await readThenEdit();

      expect(result).toMatchObject({ reason: 'file_changed', executed: false, retryable: true });
      expect(content(result)).toBe('alpha\nbeta\nchanged meanwhile\n');
      expect(await onDisk('update-me.txt')).toBe('alpha\nbeta\nchanged meanwhile\n');
    });

    it('cuts the content handed back with a conflict so that the whole result fits the limit it was given', async () => {
      await fs.writeFile(path.join(folder, 'update-me.txt'), `${'line\n'.repeat(2_000)}`);

      const { update } = generation();
      const result = await update.execute(
        { path: 'update-me.txt', old_text: 'line', new_text: 'x' },
        { maxResultChars: 1_500 },
      );

      expect(result.reason).toBe('file_changed');
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(1_500);
      expect(result.details).toMatchObject({ contentCutForContext: true });
    });
  });
});
