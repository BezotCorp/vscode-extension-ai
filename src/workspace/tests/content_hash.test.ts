import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../content_hash';

describe('sha256Hex', () => {
  it('returns the SHA-256 of the empty input', () => {
    expect(sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('returns the SHA-256 of the bytes it is given', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('depends on the exact bytes, line endings included', () => {
    const lf = sha256Hex(new TextEncoder().encode('a\nb'));
    const crlf = sha256Hex(new TextEncoder().encode('a\r\nb'));

    expect(lf).not.toBe(crlf);
    expect(lf).toMatch(/^[0-9a-f]{64}$/);
  });
});
