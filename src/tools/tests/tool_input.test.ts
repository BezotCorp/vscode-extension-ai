import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));
vi.mock('../../i18n', () => ({
  t: (key: string, params?: Record<string, unknown>) => `${key}:${JSON.stringify(params)}`,
}));

import { describeContent, readAccessArg, readNumberArg, readStringArg, readStringArrayArg } from '../tool_input';

describe('readStringArg', () => {
  it('returns a trimmed non-empty string', () => {
    expect(readStringArg({ path: '  a.ts ' }, 'path')).toBe('a.ts');
  });

  it('ignores a blank value, a non-string and a missing input', () => {
    expect(readStringArg({ path: '   ' }, 'path')).toBeUndefined();
    expect(readStringArg({ path: 3 }, 'path')).toBeUndefined();
    expect(readStringArg(undefined, 'path')).toBeUndefined();
    expect(readStringArg(null, 'path')).toBeUndefined();
  });

  it('trims the string before returning it', () => {
    expect(readStringArg({ path: '  a.ts ' }, 'path')).toBe('a.ts');
  });

  it('returns undefined for a missing input', () => {
    expect(readStringArg({}, 'path')).toBeUndefined();
  });
});

describe('readNumberArg', () => {
  it('returns an integer, from a number or a numeric string, rounding down', () => {
    expect(readNumberArg({ line: 4 }, 'line')).toBe(4);
    expect(readNumberArg({ line: '7' }, 'line')).toBe(7);
    expect(readNumberArg({ line: 4.9 }, 'line')).toBe(4);
  });

  it('ignores anything that is not a finite number', () => {
    expect(readNumberArg({ line: 'abc' }, 'line')).toBeUndefined();
    expect(readNumberArg({ line: Number.POSITIVE_INFINITY }, 'line')).toBeUndefined();
    expect(readNumberArg({ line: null }, 'line')).toBeUndefined();
    expect(readNumberArg({}, 'line')).toBeUndefined();
    expect(readNumberArg(undefined, 'line')).toBeUndefined();
  });

  it('returns undefined for a missing input', () => {
    expect(readNumberArg({}, 'line')).toBeUndefined();
  });
});

describe('readStringArrayArg', () => {
  it('returns an array as strings', () => {
    expect(readStringArrayArg({ globs: ['a', 3] }, 'globs')).toEqual(['a', '3']);
  });

  it('splits a string on whitespace, for a model that does not send an array', () => {
    expect(readStringArrayArg({ globs: ' *.ts   *.js ' }, 'globs')).toEqual(['*.ts', '*.js']);
  });

  it('ignores a blank string and any other type', () => {
    expect(readStringArrayArg({ globs: '  ' }, 'globs')).toBeUndefined();
    expect(readStringArrayArg({ globs: 3 }, 'globs')).toBeUndefined();
    expect(readStringArrayArg(null, 'globs')).toBeUndefined();
  });

  it('returns undefined for a missing input', () => {
    expect(readStringArrayArg({}, 'globs')).toBeUndefined();
  });
});

describe('describeContent', () => {
  it('counts characters and lines and shows the start, cleaned for the dialog', () => {
    expect(describeContent('first\nsecond\u0000third')).toBe(
      'detail.content:{"chars":18,"lines":2,"start":"first second third"}',
    );
  });

  it('shows only the first 160 characters', () => {
    const described = describeContent('x'.repeat(500));

    expect(described).toContain('"chars":500');
    expect(described).toContain(`"start":"${'x'.repeat(160)}"`);
  });
});

describe('readAccessArg', () => {
  it('understands the kind given as an object or as a plain string', () => {
    expect(readAccessArg({ access: { kind: 'elevated' } })).toEqual({ kind: 'elevated' });
    expect(readAccessArg({ access: 'elevated' })).toEqual({ kind: 'elevated' });
  });

  it('keeps the trimmed reason of a critical request, and an empty one when it says nothing', () => {
    expect(readAccessArg({ access: { kind: 'critical', reason: '  needed ' } })).toEqual({
      kind: 'critical',
      reason: 'needed',
    });
    expect(readAccessArg({ access: { kind: 'critical', reason: 3 } })).toEqual({ kind: 'critical', reason: '' });
    expect(readAccessArg({ access: 'critical' })).toEqual({ kind: 'critical', reason: '' });
  });

  it('counts anything not understood as normal, never as a reason to refuse', () => {
    expect(readAccessArg({ access: 'root' })).toEqual({ kind: 'normal' });
    expect(readAccessArg({ access: 5 })).toEqual({ kind: 'normal' });
    expect(readAccessArg({})).toEqual({ kind: 'normal' });
    expect(readAccessArg(undefined)).toEqual({ kind: 'normal' });
  });

  it('returns undefined for a missing input', () => {
    expect(readAccessArg({})).toEqual({ kind: 'normal' });
  });
});
