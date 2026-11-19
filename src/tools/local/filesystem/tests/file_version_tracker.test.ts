import { describe, expect, it } from 'vitest';
import { MAX_SEGMENTS_PER_FILE, MAX_TRACKED_FILES } from '../file_version_limits';
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

  it('keeps at most MAX_SEGMENTS_PER_FILE parts per file, the newest first', () => {
    const tracker = new FileVersionTracker();
    const file = Array.from({ length: MAX_SEGMENTS_PER_FILE + 1 }, (_, index) => `part ${index}`).join(' | ');

    for (let index = 0; index <= MAX_SEGMENTS_PER_FILE; index++) {
      tracker.remember('/w/a.ts', SHA_A, `part ${index}`, false, 'read');
    }

    // The oldest part was dropped: a change inside it rests on nothing the tracker still holds.
    expect(tracker.receivedPart('/w/a.ts', file, 0, 6)).toBeUndefined();
    expect(tracker.receivedPart('/w/a.ts', file, file.length - 6, 6)).toBeDefined();
  });

  it('forgets the file read longest ago once MAX_TRACKED_FILES is exceeded', () => {
    const tracker = new FileVersionTracker();

    for (let index = 0; index <= MAX_TRACKED_FILES; index++) {
      tracker.remember(`/w/${index}.ts`, SHA_A, 'x', true, 'read');
    }

    expect(tracker.hasSeen('/w/0.ts')).toBe(false);
    expect(tracker.hasSeen('/w/1.ts')).toBe(true);
    expect(tracker.hasSeen(`/w/${MAX_TRACKED_FILES}.ts`)).toBe(true);
  });

  it('replaces a partial view by the whole file when the whole file is received', () => {
    const tracker = new FileVersionTracker();

    tracker.remember('/w/a.ts', SHA_A, 'part', false, 'read');
    tracker.remember('/w/a.ts', SHA_A, 'the whole file', true, 'read');

    expect(tracker.isCurrent('/w/a.ts', SHA_A)).toBe(true);
    expect(tracker.receivedPart('/w/a.ts', 'the whole file', 0, 3)).toBeUndefined();
  });

  it('is not current for another version of the file, nor for a file never seen', () => {
    const tracker = new FileVersionTracker();

    tracker.remember('/w/a.ts', SHA_A, 'whole', true, 'read');

    expect(tracker.isCurrent('/w/a.ts', SHA_B)).toBe(false);
    expect(tracker.isSameVersion('/w/a.ts', SHA_B)).toBe(false);
    expect(tracker.isCurrent('/w/other.ts', SHA_A)).toBe(false);
    expect(tracker.hasSeen('/w/other.ts')).toBe(false);
  });

  it('ignores a part that is no longer in the file, or that does not hold the place of the change', () => {
    const tracker = new FileVersionTracker();

    tracker.remember('/w/a.ts', SHA_A, 'alpha beta', false, 'read');

    expect(tracker.receivedPart('/w/a.ts', 'changed text', 0, 3)).toBeUndefined();
    expect(tracker.receivedPart('/w/a.ts', 'alpha beta gamma', 11, 5)).toBeUndefined();
    expect(tracker.receivedPart('/w/a.ts', 'alpha beta gamma', 6, 4)).toEqual({ text: 'alpha beta', start: 0 });
  });

  it('finds the occurrence of a part that holds the place of the change when it appears twice', () => {
    const tracker = new FileVersionTracker();

    tracker.remember('/w/a.ts', SHA_A, 'dup', false, 'read');

    expect(tracker.receivedPart('/w/a.ts', 'dup dup', 4, 3)).toEqual({ text: 'dup', start: 4 });
  });

  it('never rests a change on an empty part', () => {
    const tracker = new FileVersionTracker();

    tracker.remember('/w/a.ts', SHA_A, '', false, 'read');

    expect(tracker.receivedPart('/w/a.ts', 'anything', 0, 0)).toBeUndefined();
  });

  it('counts consecutive conflicts per file and resets them', () => {
    const tracker = new FileVersionTracker();

    expect(tracker.recordConflict('/w/a.ts')).toBe(1);
    expect(tracker.recordConflict('/w/a.ts')).toBe(2);
    expect(tracker.recordConflict('/w/b.ts')).toBe(1);

    tracker.clearConflicts('/w/a.ts');

    expect(tracker.recordConflict('/w/a.ts')).toBe(1);
  });
});
