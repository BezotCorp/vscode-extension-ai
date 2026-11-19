import { describe, expect, it } from 'vitest';

import { BoundedText } from '../bounded_text';
import { HEAD_CHARS, TAIL_CHARS } from '../bounded_text_limits';

describe('BoundedText', () => {
  it('keeps everything that fits', () => {
    const text = new BoundedText();

    text.append('hello ');
    text.append('world');

    expect(text.toString()).toBe('hello world');
    expect(text.truncated).toBe(false);
  });

  it('is empty before anything is added', () => {
    expect(new BoundedText().toString()).toBe('');
  });

  it('keeps everything up to the head and the tail together', () => {
    const text = new BoundedText();
    const whole = 'a'.repeat(HEAD_CHARS + TAIL_CHARS);

    text.append(whole);

    expect(text.truncated).toBe(false);
    expect(text.toString()).toBe(whole);
  });

  it('keeps the beginning and the end of a long stream and counts what it dropped', () => {
    const text = new BoundedText();
    const middle = 'm'.repeat(1_000);

    text.append('H'.repeat(HEAD_CHARS));
    text.append(middle);
    text.append('T'.repeat(TAIL_CHARS));

    expect(text.truncated).toBe(true);
    expect(text.toString()).toBe(`${'H'.repeat(HEAD_CHARS)}\n/* 1000 characters omitted */\n${'T'.repeat(TAIL_CHARS)}`);
  });

  it('gives the beginning to the head even when it arrives in small chunks', () => {
    const text = new BoundedText();

    for (let index = 0; index < HEAD_CHARS + 10; index++) {
      text.append('h');
    }

    text.append('t'.repeat(TAIL_CHARS + 5));

    expect(text.toString().startsWith('h'.repeat(HEAD_CHARS))).toBe(true);
    expect(text.toString()).toContain('omitted');
  });

  it('splits one chunk between the head and the tail', () => {
    const text = new BoundedText();

    text.append('x'.repeat(HEAD_CHARS + 5));

    expect(text.toString()).toBe('x'.repeat(HEAD_CHARS + 5));
  });
});
