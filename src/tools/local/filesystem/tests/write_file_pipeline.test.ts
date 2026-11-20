import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('../../../tests/support/fake_vscode')).fakeVscode);

import { StateMachine, StateMachineDatabase } from '../../../../state_machine';
import { sha256Hex } from '../../../../workspace';
import { FakeUri, fakeVscode } from '../../../tests/support/fake_vscode';
import { WRITE_FILE_KIND } from '../write_file_constants';
import type { WriteFileData } from '../write_file_data';
import { WRITE_FILE_MACHINE } from '../write_file_machine';
import { WriteFilePipeline } from '../write_file_pipeline';

const DEAD_PID = 2_147_483_000;
const bytes = (text: string) => new TextEncoder().encode(text);

let base: string;
let storage: string;
let target: string;
let pipeline: WriteFilePipeline;

const uri = () => FakeUri.file(target) as never;
const onDisk = () => fs.readFile(target, 'utf8');
const backups = async () => fs.readdir(path.join(storage, 'write-backups')).catch(() => [] as string[]);

describe('WriteFilePipeline', () => {
  beforeEach(async () => {
    base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bezotcorp-pipeline-')));
    storage = path.join(base, 'storage');
    target = path.join(base, 'file.txt');
    await fs.writeFile(target, 'original');
    pipeline = new WriteFilePipeline(storage);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    pipeline.dispose();
    await fs.rm(base, { recursive: true, force: true });
  });

  it('writes the content, checks it, and removes its safety copy', async () => {
    const record = await pipeline.run(uri(), bytes('updated'), sha256Hex(bytes('original')));

    expect(record.state).toBe('integrity_true');
    expect((record.data as WriteFileData).expectedSha).toBe(sha256Hex(bytes('updated')));
    expect(await onDisk()).toBe('updated');
    expect(await backups()).toEqual([]);
  });

  it('writes nothing when the file is no longer the version the caller checked', async () => {
    const record = await pipeline.run(uri(), bytes('updated'), sha256Hex(bytes('some other version')));

    expect(record.state).toBe('copy_conflict');
    expect((record.data as WriteFileData).reason).toBe('file_changed_during_copy');
    expect(await onDisk()).toBe('original');
  });

  it('writes nothing when the safety copy cannot be made', async () => {
    await fs.writeFile(path.join(storage, 'write-backups'), 'a file where the folder should be').catch(async () => {
      await fs.mkdir(storage, { recursive: true });
      await fs.writeFile(path.join(storage, 'write-backups'), 'a file where the folder should be');
    });

    const record = await pipeline.run(uri(), bytes('updated'), sha256Hex(bytes('original')));

    expect(record.state).toBe('copy_failed');
    expect((record.data as WriteFileData).reason).toBe('backup_error');
    expect(await onDisk()).toBe('original');
  });

  it('writes nothing when the file cannot be read', async () => {
    await fs.rm(target);

    const record = await pipeline.run(uri(), bytes('updated'), sha256Hex(bytes('original')));

    expect(record.state).toBe('copy_failed');
  });

  it('restores the original when the write fails, and checks the restoration', async () => {
    const write = vi.spyOn(fakeVscode.workspace.fs, 'writeFile').mockRejectedValueOnce(new Error('disk full'));
    const record = await pipeline.run(uri(), bytes('updated'), sha256Hex(bytes('original')));

    expect(write).toHaveBeenCalledTimes(2);
    expect(record.state).toBe('restore_done');
    expect((record.data as WriteFileData).reason).toBe('write_error');
    expect((record.data as WriteFileData).error).toBe('disk full');
    expect(await onDisk()).toBe('original');
    expect(await backups()).toEqual([]);
  });

  it('restores the original when what was written is not what was intended', async () => {
    const real = fakeVscode.workspace.fs.writeFile;

    vi.spyOn(fakeVscode.workspace.fs, 'writeFile').mockImplementationOnce(async (file, _content) =>
      real(file, bytes('corrupted')),
    );

    const record = await pipeline.run(uri(), bytes('updated'), sha256Hex(bytes('original')));

    expect(record.state).toBe('restore_done');
    expect(await onDisk()).toBe('original');
  });

  it('keeps the safety copy when the original cannot be restored', async () => {
    vi.spyOn(fakeVscode.workspace.fs, 'writeFile').mockRejectedValue(new Error('read-only'));

    const record = await pipeline.run(uri(), bytes('updated'), sha256Hex(bytes('original')));

    expect(record.state).toBe('restore_failed');
    expect((record.data as WriteFileData).reason).toBe('restore_error');
    expect(await backups()).toHaveLength(1);
    expect(await fs.readFile(path.join(storage, 'write-backups', (await backups())[0] ?? ''), 'utf8')).toBe('original');
  });

  describe('recovery of an interrupted operation', () => {
    let database: StateMachineDatabase;
    let machine: StateMachine<(typeof WRITE_FILE_MACHINE)['initial']>;

    // An operation as a process that died would have left it: begun, and owned by a process that is gone.
    function interrupted(id: string, content: string, originalSha: string, state?: string): void {
      const data: WriteFileData = {
        uri: FakeUri.file(target).toString(),
        originalSha,
        expectedSha: sha256Hex(bytes(content)),
        backupPath: path.join(storage, 'write-backups', id),
      };

      machine.begin(id, data.uri, data, bytes(content));
      database.connection
        .prepare('UPDATE state_machine_operations SET owner = ?, state = COALESCE(?, state) WHERE id = ?')
        .run(DEAD_PID, state ?? null, id);
    }

    beforeEach(() => {
      database = new StateMachineDatabase(path.join(storage, 'file-operations.sqlite'));
      machine = new StateMachine(database, WRITE_FILE_KIND, WRITE_FILE_MACHINE);
    });

    afterEach(() => {
      database.close();
    });

    it('does nothing when no operation was interrupted', async () => {
      expect(await pipeline.recover()).toEqual([]);
    });

    it('finishes an operation interrupted before anything was done', async () => {
      interrupted('op-a', 'recovered', sha256Hex(bytes('original')));

      const [record] = await pipeline.recover();

      expect(record?.state).toBe('integrity_true');
      expect(await onDisk()).toBe('recovered');
    });

    it('recognizes a write that completed before the interruption was recorded', async () => {
      await fs.writeFile(target, 'recovered');
      interrupted('op-b', 'recovered', sha256Hex(bytes('original')), 'write_pending');

      const [record] = await pipeline.recover();

      expect(record?.state).toBe('integrity_true');
      expect(await onDisk()).toBe('recovered');
    });

    it('does not write over a file that changed since the operation began', async () => {
      await fs.writeFile(target, 'changed by someone else');
      interrupted('op-c', 'recovered', sha256Hex(bytes('original')), 'pending_update');

      const [record] = await pipeline.recover();

      expect(record?.state).toBe('update_conflict');
      expect((record?.data as WriteFileData | undefined)?.reason).toBe('file_changed_before_update');
      expect(await onDisk()).toBe('changed by someone else');
    });

    it('does not write over a file that changed before the physical write', async () => {
      await fs.writeFile(target, 'changed by someone else');
      interrupted('op-d', 'recovered', sha256Hex(bytes('original')), 'write_pending');

      const [record] = await pipeline.recover();

      expect(record?.state).toBe('update_conflict');
      expect((record?.data as WriteFileData | undefined)?.reason).toBe('file_changed_before_physical_write');
    });

    it('restores the original of an operation interrupted while it was being restored', async () => {
      await fs.writeFile(target, 'half written');
      await fs.mkdir(path.join(storage, 'write-backups'), { recursive: true });
      await fs.writeFile(path.join(storage, 'write-backups', 'op-e'), 'original');
      interrupted('op-e', 'recovered', sha256Hex(bytes('original')), 'restore_file');

      const [record] = await pipeline.recover();

      expect(record?.state).toBe('restore_done');
      expect(await onDisk()).toBe('original');
    });

    it('fails the operation when its content was lost', async () => {
      await fs.mkdir(path.join(storage, 'write-backups'), { recursive: true });
      interrupted('op-f', 'recovered', sha256Hex(bytes('original')), 'pending_update');
      database.connection.prepare('UPDATE state_machine_operations SET payload = NULL WHERE id = ?').run('op-f');

      const [record] = await pipeline.recover();

      expect(record?.state).toBe('update_failed');
      expect((record?.data as WriteFileData | undefined)?.reason).toBe('content_missing');
      expect(await onDisk()).toBe('original');
    });
  });
});
