import { describe, expect, it } from 'vitest';

import { WRITE_FILE_MACHINE } from '../write_file_machine';

const { transitions, initial } = WRITE_FILE_MACHINE;

describe('WRITE_FILE_MACHINE', () => {
  it('starts by making the safety copy', () => {
    expect(initial).toBe('ready_to_copy');
  });

  it('only leads to states that are defined', () => {
    for (const targets of Object.values(transitions)) {
      for (const target of targets) {
        expect(Object.keys(transitions)).toContain(target);
      }
    }
  });

  it('ends in the states where the outcome of the file is known', () => {
    const terminal = Object.entries(transitions)
      .filter(([, targets]) => targets.length === 0)
      .map(([state]) => state)
      .sort();

    expect(terminal).toEqual([
      'copy_conflict',
      'copy_failed',
      'integrity_true',
      'restore_done',
      'restore_failed',
      'update_conflict',
      'update_failed',
    ]);
  });

  it('never writes before the safety copy is done', () => {
    expect(transitions.ready_to_copy).toEqual(['copy_pending']);
    expect(transitions.copy_done).toEqual(['pending_update']);
    expect(transitions.copy_failed).toEqual([]);
    expect(transitions.copy_conflict).toEqual([]);
  });

  it('checks the integrity of every write and restores the original when it is wrong', () => {
    expect(transitions.update_done).toEqual(['check_integrity']);
    expect(transitions.check_integrity).toEqual(['integrity_true', 'integrity_false']);
    expect(transitions.integrity_false).toEqual(['restore_file']);
  });

  it('reaches every state from the initial one', () => {
    const reached = new Set<string>([initial]);
    const queue = [initial];

    while (queue.length > 0) {
      for (const target of transitions[queue.shift() as keyof typeof transitions]) {
        if (!reached.has(target)) {
          reached.add(target);
          queue.push(target);
        }
      }
    }

    expect([...reached].sort()).toEqual(Object.keys(transitions).sort());
  });
});
