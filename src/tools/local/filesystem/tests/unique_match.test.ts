import { describe, expect, it } from 'vitest';

import { findUniqueMatch } from '../unique_match';

describe('findUniqueMatch', () => {
  it('finds a text that appears once, with its exact offset', () => {
    expect(findUniqueMatch('alpha beta gamma', 'beta', 'BETA')).toEqual({
      kind: 'unique',
      offset: 6,
      oldText: 'beta',
      newText: 'BETA',
    });
  });

  it('reports a text that is not there', () => {
    expect(findUniqueMatch('alpha', 'beta', 'x')).toEqual({ kind: 'missing' });
  });

  it('reports a text that appears several times instead of guessing a place', () => {
    expect(findUniqueMatch('beta beta beta', 'beta', 'x')).toEqual({ kind: 'ambiguous', count: 3 });
  });

  it('counts overlapping occurrences', () => {
    expect(findUniqueMatch('aaa', 'aa', 'x')).toEqual({ kind: 'ambiguous', count: 2 });
  });

  it('retries with the line breaks of a file saved with CRLF', () => {
    const match = findUniqueMatch('one\r\ntwo\r\nthree', 'one\ntwo', 'uno\ndos');

    expect(match).toEqual({ kind: 'unique', offset: 0, oldText: 'one\r\ntwo', newText: 'uno\r\ndos' });
  });

  it('does not retry when the file has no CRLF', () => {
    expect(findUniqueMatch('one\ntwo', 'one\r\ntwo', 'x')).toEqual({ kind: 'missing' });
  });

  it('does not retry when the requested text already has CRLF', () => {
    expect(findUniqueMatch('one\r\ntwo', 'one\r\nzzz', 'x')).toEqual({ kind: 'missing' });
  });

  it('keeps an exact match even in a CRLF file', () => {
    expect(findUniqueMatch('a\r\nb', 'a', 'z')).toMatchObject({ kind: 'unique', oldText: 'a', newText: 'z' });
  });
});
