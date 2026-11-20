import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';

import { isParentRelative, isUriInside, realPathOrFallback } from '../path_relations';

function makeUri(uriPath: string, scheme = 'file', authority = '', fsPath = uriPath): vscode.Uri {
  return {
    scheme,
    authority,
    path: uriPath,
    fsPath,
  } as vscode.Uri;
}

describe('isParentRelative', () => {
  it('recognizes native parent traversal', () => {
    expect(isParentRelative('..', 'native')).toBe(true);
    expect(isParentRelative(`..${path.sep}other`, 'native')).toBe(true);
    expect(isParentRelative('..hidden', 'native')).toBe(false);
    expect(isParentRelative('other', 'native')).toBe(false);
    expect(isParentRelative('', 'native')).toBe(false);
  });

  it('recognizes POSIX parent traversal', () => {
    expect(isParentRelative('..', 'posix')).toBe(true);
    expect(isParentRelative('../other', 'posix')).toBe(true);
    expect(isParentRelative('../../other', 'posix')).toBe(true);
    expect(isParentRelative('..hidden', 'posix')).toBe(false);
    expect(isParentRelative('other/../child', 'posix')).toBe(false);
  });
});

describe('isUriInside', () => {
  it('compares native filesystem paths', () => {
    const root = path.resolve('workspace');
    const sibling = path.resolve('workspace-other');

    const parent = makeUri('/workspace', 'file', '', root);

    expect(isUriInside(parent, makeUri('/workspace', 'file', '', root), 'filesystem')).toBe(true);

    expect(
      isUriInside(parent, makeUri('/workspace/file.ts', 'file', '', path.join(root, 'file.ts')), 'filesystem'),
    ).toBe(true);

    expect(isUriInside(parent, makeUri('/workspace-other', 'file', '', sibling), 'filesystem')).toBe(false);

    expect(isUriInside(parent, makeUri('/outside', 'file', '', path.dirname(root)), 'filesystem')).toBe(false);
  });

  it('uses POSIX semantics for URI paths', () => {
    const parent = makeUri('/workspace', 'remote', 'server');

    expect(isUriInside(parent, makeUri('/workspace', 'remote', 'server'), 'uri')).toBe(true);
    expect(isUriInside(parent, makeUri('/workspace/src/file.ts', 'remote', 'server'), 'uri')).toBe(true);
    expect(isUriInside(parent, makeUri('/workspace-other/file.ts', 'remote', 'server'), 'uri')).toBe(false);
    expect(isUriInside(parent, makeUri('/outside/file.ts', 'remote', 'server'), 'uri')).toBe(false);
    expect(isUriInside(parent, makeUri('/', 'remote', 'server'), 'uri')).toBe(false);
  });

  it('preserves URI semantics when explicitly requested for file resources', () => {
    const parent = makeUri('/workspace', 'file', '', '/different-native-path');
    const child = makeUri('/workspace/file.ts', 'file', '', '/unrelated-native-path');

    expect(isUriInside(parent, child, 'uri')).toBe(true);
  });

  it('uses URI semantics for non-file resources even in filesystem mode', () => {
    const parent = makeUri('/workspace', 'remote', 'server', '/unrelated-native-path');
    const child = makeUri('/workspace/file.ts', 'remote', 'server', '/another-native-path');

    expect(isUriInside(parent, child, 'filesystem')).toBe(true);
  });

  it('rejects different schemes and authorities', () => {
    const parent = makeUri('/workspace', 'remote', 'server-a');

    expect(isUriInside(parent, makeUri('/workspace', 'file'), 'uri')).toBe(false);
    expect(isUriInside(parent, makeUri('/workspace', 'remote', 'server-b'), 'uri')).toBe(false);
  });
});

describe('realPathOrFallback', () => {
  it('resolves an existing filesystem path', () => {
    const current = process.cwd();
    const expected = fs.realpathSync(current);

    expect(realPathOrFallback(current, 'absolute')).toBe(expected);
    expect(realPathOrFallback(current, 'original')).toBe(expected);
  });

  it('preserves the original fallback when the path does not exist', () => {
    const missing = '__bezotcorp_nonexistent_path_relations_test__';

    expect(fs.existsSync(missing)).toBe(false);
    expect(realPathOrFallback(missing, 'original')).toBe(missing);
  });

  it('uses an absolute fallback when the path does not exist', () => {
    const missing = '__bezotcorp_nonexistent_path_relations_test__';

    expect(fs.existsSync(missing)).toBe(false);
    expect(realPathOrFallback(missing, 'absolute')).toBe(path.resolve(missing));
  });
});
