import type { Patch } from './patch';
import type { Row } from './row';
import type { StateMachineDatabase } from './state_machine_database';
import type { StateMachineDefinition } from './state_machine_definition';
import type { StateMachineRecord } from './state_machine_record';

// Persistent state machine for one kind of operation. SQLite is the source of truth for where each operation
// stands: every transition is checked against the definition and written before the work of the next state starts,
// so an interrupted operation can be found again and resumed from its last state.
export class StateMachine<State extends string> {
  constructor(
    private readonly database: StateMachineDatabase,
    private readonly kind: string,
    private readonly definition: StateMachineDefinition<State>,
  ) {}

  begin(
    id: string,
    subject: string,
    data: Record<string, unknown>,
    payload: Uint8Array | null = null,
  ): StateMachineRecord<State> {
    this.database.connection
      .prepare(
        'INSERT INTO state_machine_operations (id, kind, subject, state, data, payload, owner, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, this.kind, subject, this.definition.initial, JSON.stringify(data), payload, process.pid, Date.now());

    return this.require(id);
  }

  get(id: string): StateMachineRecord<State> | undefined {
    const row = this.database.connection
      .prepare('SELECT * FROM state_machine_operations WHERE id = ? AND kind = ?')
      .get(id, this.kind) as Row | undefined;

    return row ? this.toRecord(row) : undefined;
  }

  // Moves to `to` if the definition allows it from the current state. The update only applies if the state and
  // owner are still the ones that were read, so a driver can never advance an operation it does not own.
  advance(id: string, to: State, patch: Patch = {}): StateMachineRecord<State> {
    const current = this.require(id);

    if (!this.definition.transitions[current.state].includes(to)) {
      throw new Error(`Transition ${current.state} -> ${to} is not allowed for ${this.kind}.`);
    }

    const payload = patch.payload === undefined ? current.payload : patch.payload;
    const result = this.database.connection
      .prepare(
        'UPDATE state_machine_operations SET state = ?, data = ?, payload = ?, owner = ?, updated_at = ? WHERE id = ? AND kind = ? AND state = ? AND owner = ?',
      )
      .run(
        to,
        JSON.stringify({ ...current.data, ...patch.data }),
        payload,
        process.pid,
        Date.now(),
        id,
        this.kind,
        current.state,
        process.pid,
      );

    if (Number(result.changes) !== 1) {
      throw new Error(`Operation ${id} changed state while moving from ${current.state} to ${to}.`);
    }

    return this.require(id);
  }

  isFinal(state: State): boolean {
    return this.definition.transitions[state].length === 0;
  }

  // Atomically claims operations that did not reach a final state and whose owner process is gone.
  // Several VS Code windows may observe the same dead owner, but only one can replace that exact
  // owner/state pair and therefore become the recovery driver.
  claimInterrupted(): StateMachineRecord<State>[] {
    const rows = this.database.connection
      .prepare('SELECT * FROM state_machine_operations WHERE kind = ? ORDER BY updated_at')
      .all(this.kind) as Row[];

    const claimed: StateMachineRecord<State>[] = [];

    for (const row of rows) {
      const record = this.toRecord(row);

      if (this.isFinal(record.state) || record.owner === process.pid || isAlive(record.owner)) {
        continue;
      }

      const result = this.database.connection
        .prepare(
          'UPDATE state_machine_operations SET owner = ?, updated_at = ? WHERE id = ? AND kind = ? AND state = ? AND owner = ?',
        )
        .run(process.pid, Date.now(), record.id, this.kind, record.state, record.owner);

      if (Number(result.changes) === 1) {
        claimed.push(this.require(record.id));
      }
    }

    return claimed;
  }

  private require(id: string): StateMachineRecord<State> {
    const record = this.get(id);

    if (!record) {
      throw new Error(`Operation ${id} does not exist.`);
    }

    return record;
  }

  private toRecord(row: Row): StateMachineRecord<State> {
    return {
      id: row.id,
      kind: row.kind,
      subject: row.subject,
      state: row.state as State,
      data: JSON.parse(row.data) as Record<string, unknown>,
      payload: row.payload,
      owner: Number(row.owner),
      updatedAt: Number(row.updated_at),
    };
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code === 'EPERM';
  }
}
