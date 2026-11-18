import { describe, expect, it } from 'vitest';

import { FileVersionTracker } from '../file_version_tracker';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

describe('FileVersionTracker observations', () => {
  it('records a whole view with its SHA and without any text', () => {
    const tracker = new FileVersionTracker();

    tracker.remember('/w/a.ts', SHA_A, 'whole file', true, 'read');

    expect(tracker.takeObservations()).toEqual([{ path: '/w/a.ts', sha: SHA_A, complete: true, origin: 'read' }]);
  });

  it('records a partial view with exactly the text received and no position', () => {
    const tracker = new FileVersionTracker();

    tracker.remember('/w/a.ts', SHA_A, 'line 3\nline 4', false, 'read');

    const [observation] = tracker.takeObservations();

    expect(observation).toEqual({
      path: '/w/a.ts',
      sha: SHA_A,
      complete: false,
      origin: 'read',
      text: 'line 3\nline 4',
    });
    expect(Object.keys(observation ?? {})).not.toContain('start');
  });

  it('hands each observation over once, in order', () => {
    const tracker = new FileVersionTracker();

    tracker.remember('/w/a.ts', SHA_A, 'x', false, 'read');
    tracker.remember('/w/b.ts', SHA_B, 'y', true, 'created');

    expect(tracker.takeObservations().map((observation) => observation.origin)).toEqual(['read', 'created']);
    expect(tracker.takeObservations()).toEqual([]);
  });

  it('records a view even when the tracker evicts it, and keeps what it decides unchanged', () => {
    const tracker = new FileVersionTracker();

    tracker.remember('/w/a.ts', SHA_A, 'part one', false, 'read');
    tracker.remember('/w/a.ts', SHA_A, 'part two', false, 'read');
    tracker.takeObservations();

    expect(tracker.hasSeen('/w/a.ts')).toBe(true);
    expect(tracker.isSameVersion('/w/a.ts', SHA_A)).toBe(true);
    expect(tracker.isCurrent('/w/a.ts', SHA_A)).toBe(false);
    expect(tracker.receivedPart('/w/a.ts', 'xx part one yy part two', 3, 4)).toEqual({ text: 'part one', start: 3 });
  });

  it('does not make a partial view complete when the same version is seen again', () => {
    const tracker = new FileVersionTracker();

    tracker.remember('/w/a.ts', SHA_A, 'whole', true, 'read');
    tracker.remember('/w/a.ts', SHA_A, 'whole', false, 'conflict');

    expect(tracker.takeObservations().map((observation) => observation.complete)).toEqual([true, false]);
  });
});
