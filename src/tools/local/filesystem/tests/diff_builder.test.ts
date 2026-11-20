import { describe, expect, it } from 'vitest';

import { buildDiffLines } from '../diff_builder';

describe('buildDiffLines', () => {
  it('marks every line unchanged when nothing differs', () => {
    expect(buildDiffLines('a\nb', 'a\nb')).toEqual([
      { kind: 'unchanged', content: 'a' },
      { kind: 'unchanged', content: 'b' },
    ]);
  });

  it('keeps the common start and end, and shows what lies between as removed then added', () => {
    expect(buildDiffLines('a\nb\nc', 'a\nX\nY\nc')).toEqual([
      { kind: 'unchanged', content: 'a' },
      { kind: 'removed', content: 'b' },
      { kind: 'added', content: 'X' },
      { kind: 'added', content: 'Y' },
      { kind: 'unchanged', content: 'c' },
    ]);
  });

  it('shows an addition with nothing removed', () => {
    expect(buildDiffLines('a\nc', 'a\nb\nc').map((line) => line.kind)).toEqual(['unchanged', 'added', 'unchanged']);
  });

  it('shows a deletion with nothing added', () => {
    expect(buildDiffLines('a\nb\nc', 'a\nc').map((line) => line.kind)).toEqual(['unchanged', 'removed', 'unchanged']);
  });

  it('shows a whole different text as removed then added', () => {
    expect(buildDiffLines('a', 'b')).toEqual([
      { kind: 'removed', content: 'a' },
      { kind: 'added', content: 'b' },
    ]);
  });

  it('does not count a line twice when the prefix and the suffix would overlap', () => {
    const lines = buildDiffLines('a\na', 'a\na\na');

    expect(lines.filter((line) => line.kind === 'unchanged')).toHaveLength(2);
    expect(lines.filter((line) => line.kind === 'added')).toHaveLength(1);
  });
});
