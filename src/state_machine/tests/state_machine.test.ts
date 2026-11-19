import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StateMachine } from '../state_machine';
import { StateMachineDatabase } from '../state_machine_database';
import type { StateMachineDefinition } from '../state_machine_definition';

type State = 'start' | 'middle' | 'done' | 'failed';

const definition: StateMachineDefinition<State> = {
  initial: 'start',
  transitions: { start: ['middle'], middle: ['done', 'failed'], done: [], failed: [] },
};

const DEAD_PID = 2_147_483_000;

let directory: string;
let database: StateMachineDatabase;
let machine: StateMachine<State>;

function makeOwnerDead(id: string): void {
  database.connection.prepare('UPDATE state_machine_operations SET owner = ? WHERE id = ?').run(DEAD_PID, id);
}

describe('StateMachine', () => {
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bezotcorp-machine-'));
    database = new StateMachineDatabase(path.join(directory, 'nested', 'machine.sqlite'));
    machine = new StateMachine(database, 'test_kind', definition);
  });

  afterEach(async () => {
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('begins an operation in the initial state, owned by this process, with its data and payload', () => {
    const record = machine.begin('op-1', 'subject', { a: 1 }, new Uint8Array([1, 2, 3]));

    expect(record).toMatchObject({ id: 'op-1', kind: 'test_kind', subject: 'subject', state: 'start', data: { a: 1 } });
    expect(record.owner).toBe(process.pid);
    expect(Array.from(record.payload ?? [])).toEqual([1, 2, 3]);
  });

  it('begins without payload by default', () => {
    expect(machine.begin('op-1', 's', {}).payload).toBeNull();
  });

  it('creates the folder of the database on first use', async () => {
    machine.begin('op-1', 's', {});

    await expect(fs.stat(path.join(directory, 'nested', 'machine.sqlite'))).resolves.toBeDefined();
  });

  it('finds an operation of its kind, and not an unknown one or one of another kind', () => {
    machine.begin('op-1', 's', {});

    expect(machine.get('op-1')?.id).toBe('op-1');
    expect(machine.get('nope')).toBeUndefined();
    expect(new StateMachine(database, 'other_kind', definition).get('op-1')).toBeUndefined();
  });

  it('refuses to begin the same operation twice', () => {
    machine.begin('op-1', 's', {});

    expect(() => machine.begin('op-1', 's', {})).toThrow();
  });

  it('advances along an allowed transition, merging data and keeping the payload unless told otherwise', () => {
    machine.begin('op-1', 's', { a: 1 }, new Uint8Array([9]));

    const next = machine.advance('op-1', 'middle', { data: { b: 2 } });

    expect(next.state).toBe('middle');
    expect(next.data).toEqual({ a: 1, b: 2 });
    expect(Array.from(next.payload ?? [])).toEqual([9]);
  });

  it('can drop the payload while advancing', () => {
    machine.begin('op-1', 's', {}, new Uint8Array([9]));

    expect(machine.advance('op-1', 'middle', { payload: null }).payload).toBeNull();
  });

  it('refuses a transition the definition does not allow, and stays where it was', () => {
    machine.begin('op-1', 's', {});

    expect(() => machine.advance('op-1', 'done')).toThrow('Transition start -> done is not allowed for test_kind.');
    expect(machine.get('op-1')?.state).toBe('start');
  });

  it('refuses to advance an operation that does not exist', () => {
    expect(() => machine.advance('nope', 'middle')).toThrow('does not exist');
  });

  it('refuses to advance an operation another process owns', () => {
    machine.begin('op-1', 's', {});
    makeOwnerDead('op-1');

    expect(() => machine.advance('op-1', 'middle')).toThrow('changed state');
  });

  it('knows the final states', () => {
    expect(machine.isFinal('done')).toBe(true);
    expect(machine.isFinal('failed')).toBe(true);
    expect(machine.isFinal('middle')).toBe(false);
  });

  describe('claimInterrupted', () => {
    it('claims an operation that is not final and whose owner is gone, once', () => {
      machine.begin('op-1', 's', {});
      makeOwnerDead('op-1');

      const claimed = machine.claimInterrupted();

      expect(claimed.map((record) => record.id)).toEqual(['op-1']);
      expect(claimed[0]?.owner).toBe(process.pid);
      expect(machine.claimInterrupted()).toEqual([]);
    });

    it('leaves alone an operation of this process', () => {
      machine.begin('op-1', 's', {});

      expect(machine.claimInterrupted()).toEqual([]);
    });

    it('leaves alone an operation whose owner is still running', () => {
      machine.begin('op-1', 's', {});
      database.connection
        .prepare('UPDATE state_machine_operations SET owner = ? WHERE id = ?')
        .run(process.ppid, 'op-1');

      expect(machine.claimInterrupted()).toEqual([]);
    });

    it('leaves alone an operation that reached a final state', () => {
      machine.begin('op-1', 's', {});
      machine.advance('op-1', 'middle');
      machine.advance('op-1', 'done');
      makeOwnerDead('op-1');

      expect(machine.claimInterrupted()).toEqual([]);
    });

    it('does not claim the operations of another kind', () => {
      new StateMachine(database, 'other_kind', definition).begin('op-1', 's', {});
      makeOwnerDead('op-1');

      expect(machine.claimInterrupted()).toEqual([]);
    });

    it('claims the oldest first', () => {
      machine.begin('late', 's', {});
      machine.begin('early', 's', {});
      database.connection
        .prepare('UPDATE state_machine_operations SET owner = ?, updated_at = ? WHERE id = ?')
        .run(DEAD_PID, 1, 'early');
      database.connection
        .prepare('UPDATE state_machine_operations SET owner = ?, updated_at = ? WHERE id = ?')
        .run(DEAD_PID, 2, 'late');

      expect(machine.claimInterrupted().map((record) => record.id)).toEqual(['early', 'late']);
    });
  });

  it('can be closed and used again, reopening the same file', () => {
    machine.begin('op-1', 's', { a: 1 });
    database.close();

    expect(machine.get('op-1')?.data).toEqual({ a: 1 });
  });
});
