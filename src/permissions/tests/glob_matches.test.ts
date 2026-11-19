import { describe, expect, it } from 'vitest';

import { globMatches } from '../glob_matches';

describe('globMatches', () => {
  it('lets a pattern without wildcard cover itself and everything below it', () => {
    expect(globMatches('/work/src', '/work/src')).toBe(true);
    expect(globMatches('/work/src', '/work/src/a/b.ts')).toBe(true);
    expect(globMatches('/work/src', '/work/src2')).toBe(false);
    expect(globMatches('/work/src', '/work')).toBe(false);
  });

  it('accepts a backslash separator below a plain pattern', () => {
    expect(globMatches('C:\\work', 'C:\\work\\a.ts')).toBe(true);
  });

  it('keeps * inside one path segment', () => {
    expect(globMatches('/work/*.ts', '/work/a.ts')).toBe(true);
    expect(globMatches('/work/*.ts', '/work/a/b.ts')).toBe(false);
    expect(globMatches('*.pem', 'key.pem')).toBe(true);
    expect(globMatches('*.pem', 'key.pem.bak')).toBe(false);
  });

  it('lets ** cross segments, with or without the following slash', () => {
    expect(globMatches('/work/**/a.ts', '/work/x/y/a.ts')).toBe(true);
    expect(globMatches('/work/**/a.ts', '/work/a.ts')).toBe(true);
    expect(globMatches('/work/**', '/work/x/y')).toBe(true);
  });

  it('matches exactly one character with ?', () => {
    expect(globMatches('file?.txt', 'file1.txt')).toBe(true);
    expect(globMatches('file?.txt', 'file12.txt')).toBe(false);
    expect(globMatches('file?.txt', 'file/.txt')).toBe(false);
  });

  it('treats regular expression characters in the pattern literally', () => {
    expect(globMatches('a.b', 'a.b')).toBe(true);
    expect(globMatches('a.b', 'axb')).toBe(false);
    expect(globMatches('(x)+[y]', '(x)+[y]')).toBe(true);
    expect(globMatches('a$b^c', 'a$b^c')).toBe(true);
  });

  it('does not let a wildcard pattern cover what lies below its match', () => {
    expect(globMatches('/work/*', '/work/dir/file')).toBe(false);
  });
});
