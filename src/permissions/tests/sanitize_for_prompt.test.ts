import { describe, expect, it } from 'vitest';

import { sanitizeForPrompt } from '../sanitize_for_prompt';

describe('sanitizeForPrompt', () => {
  it('keeps ordinary text', () => {
    expect(sanitizeForPrompt('rm -rf build')).toBe('rm -rf build');
  });

  it('replaces line breaks and control characters so no extra line can be faked', () => {
    expect(sanitizeForPrompt('first\nSecond line\r\n\tthird\u0000end')).toBe('first Second line third end');
  });

  it('removes bidirectional override characters', () => {
    expect(sanitizeForPrompt('a\u202eb\u2066c')).toBe('a b c');
  });

  it('trims the result', () => {
    expect(sanitizeForPrompt('  \n text \n ')).toBe('text');
  });

  it('cuts text longer than the limit and marks it', () => {
    expect(sanitizeForPrompt('x'.repeat(400))).toBe(`${'x'.repeat(300)}…`);
    expect(sanitizeForPrompt('abcdef', 3)).toBe('abc…');
  });

  it('does not cut text that is exactly at the limit', () => {
    expect(sanitizeForPrompt('abc', 3)).toBe('abc');
  });
});
