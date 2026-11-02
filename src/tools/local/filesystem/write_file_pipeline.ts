import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { StateMachine, StateMachineDatabase, StateMachineRecord } from '../../../state_machine';
import { sha256Hex } from '../../../workspace';
import { WRITE_FILE_KIND, WRITE_FILE_MACHINE } from './write_file_machine';
import { WriteFileData } from './write_file_data';
import { WriteFileState } from './write_file_state';

// The persistent part of write_file: safety copy, physical write, integrity check against the projected content and
// restoration, one step per state of the machine. The state is written to SQLite before the work of the next state
// starts, so the same loop resumes an interrupted operation from its last state. Every step can be run again.
export class WriteFilePipeline {
  private readonly database: StateMachineDatabase;
  private readonly machine: StateMachine<WriteFileState>;
  private readonly backupDirectory: string;

  constructor(storagePath: string) {
    this.database = new StateMachineDatabase(path.join(storagePath, 'file-operations.sqlite'));
    this.machine = new StateMachine(this.database, WRITE_FILE_KIND, WRITE_FILE_MACHINE);
    this.backupDirectory = path.join(storagePath, 'write-backups');
  }

  // `content` is the projected final content of the file and `originalSha` the version it replaces.
  async run(target: vscode.Uri, content: Uint8Array, originalSha: string): Promise<StateMachineRecord<WriteFileState>> {
    const id = randomUUID();
    const data: WriteFileData = {
      path: target.fsPath,
      originalSha,
      expectedSha: sha256Hex(content),
      backupPath: path.join(this.backupDirectory, id),
    };

    this.machine.begin(id, target.fsPath, data, content);

    return this.drive(id);
  }

  // Resumes the operations left unfinished by a process that is gone.
  async recover(): Promise<StateMachineRecord<WriteFileState>[]> {
    const finished: StateMachineRecord<WriteFileState>[] = [];

    for (const record of this.machine.interrupted()) {
      finished.push(await this.drive(record.id));
    }

    return finished;
  }

  dispose(): void {
    this.database.close();
  }

  private async drive(id: string): Promise<StateMachineRecord<WriteFileState>> {
    for (;;) {
      const record = this.require(id);

      switch (record.state) {
        case 'ready_to_copy':
          this.machine.advance(id, 'copy_pending');
          break;
        case 'copy_pending':
          await this.copy(record);
          break;
        case 'copy_done':
          this.machine.advance(id, 'pending_update');
          break;
        case 'pending_update':
          await this.prepareUpdate(record);
          break;
        case 'write_pending':
          await this.write(record);
          break;
        case 'update_done':
          this.machine.advance(id, 'check_integrity');
          break;
        case 'check_integrity':
          await this.checkIntegrity(record);
          break;
        case 'integrity_false':
          this.machine.advance(id, 'restore_file');
          break;
        case 'restore_file':
          await this.restore(record);
          break;
        default:
          await this.cleanUp(record);
          return record;
      }
    }
  }

  private require(id: string): StateMachineRecord<WriteFileState> {
    const record = this.machine.get(id);

    if (!record) {
      throw new Error(`Write operation ${id} is missing from the database.`);
    }

    return record;
  }

  private async copy(record: StateMachineRecord<WriteFileState>): Promise<void> {
    const data = record.data as WriteFileData;

    try {
      const original = await fs.promises.readFile(data.path);

      // The copy has to be of the version that was checked: anything else means the file moved in between.
      if (sha256Hex(original) !== data.originalSha) {
        this.machine.advance(record.id, 'copy_conflict', {
          data: { reason: 'file_changed_during_copy' },
          payload: null,
        });
        return;
      }

      await fs.promises.mkdir(this.backupDirectory, { recursive: true });
      await fs.promises.writeFile(`${data.backupPath}.tmp`, original);
      await fs.promises.rename(`${data.backupPath}.tmp`, data.backupPath);

      if (sha256Hex(await fs.promises.readFile(data.backupPath)) !== data.originalSha) {
        this.machine.advance(record.id, 'copy_failed', { data: { reason: 'backup_validation_failed' }, payload: null });
        return;
      }

      this.machine.advance(record.id, 'copy_done');
    } catch (error) {
      this.machine.advance(record.id, 'copy_failed', {
        data: { reason: 'backup_error', error: describe(error) },
        payload: null,
      });
    }
  }

  private async prepareUpdate(record: StateMachineRecord<WriteFileState>): Promise<void> {
    const data = record.data as WriteFileData;

    try {
      const current = sha256Hex(await fs.promises.readFile(data.path));

      if (current === data.expectedSha) {
        this.machine.advance(record.id, 'update_done');
        return;
      }

      if (current !== data.originalSha) {
        this.machine.advance(record.id, 'update_conflict', {
          data: { reason: 'file_changed_before_update' },
          payload: null,
        });
        return;
      }

      if (!record.payload) {
        this.machine.advance(record.id, 'update_failed', {
          data: { reason: 'content_missing' },
          payload: null,
        });
        return;
      }

      // Persisted before the physical write: from this state onward the write may have started.
      this.machine.advance(record.id, 'write_pending');
    } catch (error) {
      this.machine.advance(record.id, 'update_failed', {
        data: { reason: 'read_error', error: describe(error) },
        payload: null,
      });
    }
  }

  private async write(record: StateMachineRecord<WriteFileState>): Promise<void> {
    const data = record.data as WriteFileData;

    try {
      const current = sha256Hex(await fs.promises.readFile(data.path));

      if (current === data.expectedSha) {
        // The physical write completed before an interruption prevented the state transition.
        this.machine.advance(record.id, 'update_done');
        return;
      }

      if (current !== data.originalSha) {
        this.machine.advance(record.id, 'update_conflict', {
          data: { reason: 'file_changed_before_physical_write' },
          payload: null,
        });
        return;
      }

      if (!record.payload) {
        this.machine.advance(record.id, 'update_failed', {
          data: { reason: 'content_missing' },
          payload: null,
        });
        return;
      }

      try {
        await vscode.workspace.fs.writeFile(vscode.Uri.file(data.path), record.payload);
        this.machine.advance(record.id, 'update_done');
      } catch (error) {
        this.machine.advance(record.id, 'restore_file', {
          data: { reason: 'write_error', error: describe(error) },
          payload: null,
        });
      }
    } catch (error) {
      this.machine.advance(record.id, 'restore_file', {
        data: { reason: 'write_state_read_error', error: describe(error) },
        payload: null,
      });
    }
  }

  private async checkIntegrity(record: StateMachineRecord<WriteFileState>): Promise<void> {
    const data = record.data as WriteFileData;

    try {
      const actual = sha256Hex(await fs.promises.readFile(data.path));

      if (actual === data.expectedSha) {
        this.machine.advance(record.id, 'integrity_true', { payload: null });
        return;
      }
    } catch {
      // A file that cannot be read back is not the projected content either.
    }

    this.machine.advance(record.id, 'integrity_false', { payload: null });
  }

  private async restore(record: StateMachineRecord<WriteFileState>): Promise<void> {
    const data = record.data as WriteFileData;

    try {
      const backup = await fs.promises.readFile(data.backupPath);

      if (sha256Hex(backup) === data.originalSha) {
        await vscode.workspace.fs.writeFile(vscode.Uri.file(data.path), backup);

        if (sha256Hex(await fs.promises.readFile(data.path)) === data.originalSha) {
          this.machine.advance(record.id, 'restore_done');
          return;
        }
      }

      this.machine.advance(record.id, 'restore_failed', { data: { reason: 'restore_mismatch' } });
    } catch (error) {
      this.machine.advance(record.id, 'restore_failed', { data: { reason: 'restore_error', error: describe(error) } });
    }
  }

  // The safety copy is only kept while it may still be needed: when the file could not be put back.
  private async cleanUp(record: StateMachineRecord<WriteFileState>): Promise<void> {
    if (record.state === 'restore_failed') {
      return;
    }

    const data = record.data as WriteFileData;

    await fs.promises.rm(data.backupPath, { force: true }).catch(() => undefined);
    await fs.promises.rm(`${data.backupPath}.tmp`, { force: true }).catch(() => undefined);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
