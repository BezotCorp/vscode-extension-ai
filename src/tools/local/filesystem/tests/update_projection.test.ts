import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));
vi.mock('../../../../i18n', () => ({ t: (key: string, params?: { line: number }) => `${key}:${params?.line}` }));

import { sha256Hex } from '../../../../workspace';
import { projectUpdate } from '../update_projection';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('projectUpdate with a local edit', () => {
  it('produces the exact bytes, their SHA, the anchor and a preview', () => {
    const projection = projectUpdate(bytes('one\ntwo\nthree'), { kind: 'edit', oldText: 'two', newText: 'TWO' });

    expect(projection).toMatchObject({
      ok: true,
      before: 'one\ntwo\nthree',
      after: 'one\nTWO\nthree',
      anchor: { offset: 4, oldText: 'two', newText: 'TWO' },
      detail: 'detail.line:2\n- two\n+ TWO',
    });
    expect(projection.ok && new TextDecoder().decode(projection.bytes)).toBe('one\nTWO\nthree');
    expect(projection.ok && projection.sha).toBe(sha256Hex(bytes('one\nTWO\nthree')));
  });

  it('refuses an edit that changes nothing', () => {
    expect(projectUpdate(bytes('a'), { kind: 'edit', oldText: 'a', newText: 'a' })).toMatchObject({
      ok: false,
      reason: 'no_change',
      retryable: false,
    });
  });

  it('refuses a text that is not found, or that is found several times', () => {
    expect(projectUpdate(bytes('a'), { kind: 'edit', oldText: 'zz', newText: 'b' })).toMatchObject({
      ok: false,
      reason: 'old_text_not_found',
      retryable: true,
    });
    expect(projectUpdate(bytes('a a'), { kind: 'edit', oldText: 'a', newText: 'b' })).toMatchObject({
      ok: false,
      reason: 'ambiguous_match',
      details: { occurrences: 2 },
    });
  });

  it('refuses a file that is not valid UTF-8', () => {
    expect(
      projectUpdate(new Uint8Array([0xff, 0xfe, 0x41]), { kind: 'edit', oldText: 'A', newText: 'B' }),
    ).toMatchObject({
      ok: false,
      reason: 'not_text',
    });
  });

  it('keeps a byte order mark as it is', () => {
    const projection = projectUpdate(bytes('﻿hello'), { kind: 'edit', oldText: 'hello', newText: 'bye' });

    expect(projection.ok && projection.bytes.slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
    expect(projection.ok && projection.before).toBe('hello');
    expect(projection.ok && projection.anchor?.offset).toBe(0);
  });

  it('keeps the line breaks of a CRLF file', () => {
    const projection = projectUpdate(bytes('a\r\nb\r\nc'), { kind: 'edit', oldText: 'a\nb', newText: 'x\ny' });

    expect(projection.ok && projection.after).toBe('x\r\ny\r\nc');
  });
});

describe('projectUpdate with a whole replacement', () => {
  it('produces the new content, without an anchor', () => {
    const projection = projectUpdate(bytes('old\nsame'), { kind: 'replace', content: 'new\nsame' });

    expect(projection).toMatchObject({ ok: true, before: 'old\nsame', after: 'new\nsame', detail: '- old\n+ new' });
    expect(projection.ok && projection.anchor).toBeUndefined();
  });

  it('refuses a content identical to the file, byte for byte', () => {
    expect(projectUpdate(bytes('same'), { kind: 'replace', content: 'same' })).toMatchObject({
      ok: false,
      reason: 'no_change',
    });
  });

  it('replaces a file that is not valid UTF-8, since nothing of it is matched', () => {
    expect(projectUpdate(new Uint8Array([0xff, 0xfe]), { kind: 'replace', content: 'text' }).ok).toBe(true);
  });
});
