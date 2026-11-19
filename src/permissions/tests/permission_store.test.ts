import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';

const settings = vi.hoisted(() => ({ value: undefined as unknown, updates: [] as unknown[] }));

vi.mock('vscode', () => {
  const makeUri = (scheme: string, authority: string, uriPath: string) => ({
    scheme,
    authority,
    path: uriPath,
    with: () => makeUri(scheme, authority, uriPath),
    toString: () => `${scheme}://${authority}${uriPath}`,
  });

  return {
    ConfigurationTarget: { Global: 1 },
    Uri: {
      parse: (value: string) => {
        const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)/.exec(value);

        if (!match) {
          throw new Error('not a URI');
        }

        return makeUri(match[1] ?? '', match[2] ?? '', match[3] ?? '');
      },
    },
    workspace: {
      getConfiguration: () => ({
        inspect: () => ({ globalValue: settings.value }),
        update: async (_key: string, value: unknown) => {
          settings.updates.push(value);
          settings.value = value;
        },
      }),
    },
  };
});

import { PermissionStore } from '../permission_store';

function makeMemento(initial?: unknown): vscode.Memento & { stored: unknown } {
  const memento = {
    stored: initial,
    keys: () => [],
    get: (_key: string, fallback?: unknown) => (memento.stored === undefined ? fallback : memento.stored),
    update: async (_key: string, value: unknown) => {
      memento.stored = value;
    },
  };

  return memento as unknown as vscode.Memento & { stored: unknown };
}

const FILE = path.resolve('/work/project/src/a.ts');
const FOLDER = path.resolve('/work/project');

describe('PermissionStore tool decisions', () => {
  beforeEach(() => {
    settings.value = undefined;
    settings.updates = [];
  });

  it('keeps a current-session decision in memory only', async () => {
    const store = new PermissionStore(makeMemento());

    await store.set('read_file', 'allow', 'currentSession');

    expect(store.get('read_file', 'currentSession')).toBe('allow');
    expect(store.get('read_file', 'allSessions')).toBeUndefined();
    expect(settings.updates).toEqual([]);
  });

  it('writes an all-sessions decision to the user settings', async () => {
    const store = new PermissionStore(makeMemento());

    await store.set('read_file', 'deny', 'allSessions');

    expect(settings.updates).toEqual([{ read_file: 'deny' }]);
    expect(store.get('read_file', 'allSessions')).toBe('deny');
  });

  it('ignores invalid policies and a setting that is not an object', () => {
    const store = new PermissionStore(makeMemento());

    settings.value = { good: 'ask', bad: 'maybe', worse: 3 };
    expect(store.list()).toEqual([{ toolId: 'good', policy: 'ask', lifetime: 'allSessions' }]);

    settings.value = 'nonsense';
    expect(store.list()).toEqual([]);

    settings.value = null;
    expect(store.list()).toEqual([]);
  });

  it('resolves to the first lifetime that has a decision', async () => {
    const store = new PermissionStore(makeMemento());

    expect(store.resolve('t')).toBeUndefined();

    await store.set('t', 'allow', 'allSessions');
    expect(store.resolve('t')).toEqual({ policy: 'allow', lifetime: 'allSessions' });

    await store.set('t', 'ask', 'currentSession');
    expect(store.resolve('t')).toEqual({ policy: 'ask', lifetime: 'currentSession' });
  });

  it('lets a deny at any lifetime win', async () => {
    const store = new PermissionStore(makeMemento());

    await store.set('t', 'allow', 'currentSession');
    await store.set('t', 'deny', 'allSessions');

    expect(store.resolve('t')).toEqual({ policy: 'deny', lifetime: 'allSessions' });
  });

  it('clears one decision, and writes nothing when there was none', async () => {
    const store = new PermissionStore(makeMemento());

    await store.set('a', 'allow', 'allSessions');
    await store.set('b', 'deny', 'allSessions');
    settings.updates = [];

    await store.clear('missing', 'allSessions');
    expect(settings.updates).toEqual([]);

    await store.clear('a', 'allSessions');
    expect(settings.updates).toEqual([{ b: 'deny' }]);
  });

  it('clears every decision of a lifetime', async () => {
    const store = new PermissionStore(makeMemento());

    await store.set('a', 'allow', 'currentSession');
    await store.set('b', 'allow', 'allSessions');
    await store.clearToolDecisions('currentSession');

    expect(store.list()).toEqual([{ toolId: 'b', policy: 'allow', lifetime: 'allSessions' }]);
  });

  it('lists decisions of the session first, then of all sessions', async () => {
    const store = new PermissionStore(makeMemento());

    await store.set('b', 'ask', 'allSessions');
    await store.set('a', 'allow', 'currentSession');

    expect(store.list().map((entry) => entry.lifetime)).toEqual(['currentSession', 'allSessions']);
  });
});

describe('PermissionStore resource grants', () => {
  beforeEach(() => {
    settings.value = undefined;
  });

  it('allows an exact path only for the tool it was granted to', async () => {
    const store = new PermissionStore(makeMemento());

    await store.allowResource('read_file', FILE, 'exact', 'currentSession');

    expect(store.isResourceAllowed('read_file', FILE)?.kind).toBe('exact');
    expect(store.isResourceAllowed('delete_file', FILE)).toBeUndefined();
    expect(store.isResourceAllowed('read_file', `${FILE}x`)).toBeUndefined();
  });

  it('lets a directory grant cover the folder and everything below it, not a sibling', async () => {
    const store = new PermissionStore(makeMemento());

    await store.allowResource('read_file', FOLDER, 'directory', 'currentSession');

    expect(store.isResourceAllowed('read_file', FOLDER)).toBeDefined();
    expect(store.isResourceAllowed('read_file', FILE)).toBeDefined();
    expect(store.isResourceAllowed('read_file', `${FOLDER}-other/a.ts`)).toBeUndefined();
    expect(store.isResourceAllowed('read_file', path.resolve('/work'))).toBeUndefined();
  });

  it('covers a structural workspace like a directory', async () => {
    const store = new PermissionStore(makeMemento());

    await store.allowResource('read_file', FOLDER, 'structuralWorkspace', 'currentSession');

    expect(store.isResourceAllowed('read_file', FILE)?.kind).toBe('structuralWorkspace');
  });

  it('covers URI resources only within the same scheme and authority', async () => {
    const store = new PermissionStore(makeMemento());

    await store.allowResource('read_file', 'vscode-vfs://github/owner/repo', 'directory', 'currentSession');

    expect(store.isResourceAllowed('read_file', 'vscode-vfs://github/owner/repo/src/a.ts')).toBeDefined();
    expect(store.isResourceAllowed('read_file', 'vscode-vfs://github/owner/repo2/a.ts')).toBeUndefined();
    expect(store.isResourceAllowed('read_file', 'vscode-vfs://gitlab/owner/repo/a.ts')).toBeUndefined();
    expect(store.isResourceAllowed('read_file', FILE)).toBeUndefined();
  });

  it('does not let a local directory grant cover a URI resource', async () => {
    const store = new PermissionStore(makeMemento());

    await store.allowResource('read_file', FOLDER, 'directory', 'currentSession');

    expect(store.isResourceAllowed('read_file', 'vscode-vfs://github/work/project/a.ts')).toBeUndefined();
  });

  it('keeps an all-sessions grant in the extension state, without its lifetime', async () => {
    const memento = makeMemento();
    const store = new PermissionStore(memento);

    await store.allowResource('read_file', FOLDER, 'directory', 'allSessions');

    expect(memento.stored).toEqual([{ toolId: 'read_file', path: FOLDER, kind: 'directory' }]);
    expect(store.listResourcePermissions()).toEqual([
      { toolId: 'read_file', path: FOLDER, kind: 'directory', lifetime: 'allSessions' },
    ]);
  });

  it('replaces an identical grant instead of repeating it', async () => {
    const store = new PermissionStore(makeMemento());

    await store.allowResource('read_file', FILE, 'exact', 'currentSession');
    await store.allowResource('read_file', FILE, 'exact', 'currentSession');
    await store.allowResource('read_file', FILE, 'directory', 'currentSession');

    expect(store.listResourcePermissions()).toHaveLength(2);
  });

  it('prefers a session grant to an all-sessions one', async () => {
    const store = new PermissionStore(makeMemento());

    await store.allowResource('read_file', FOLDER, 'directory', 'allSessions');
    await store.allowResource('read_file', FILE, 'exact', 'currentSession');

    expect(store.isResourceAllowed('read_file', FILE)?.lifetime).toBe('currentSession');
  });

  it('drops malformed stored grants and a stored value that is not a list', () => {
    const store = new PermissionStore(
      makeMemento([
        null,
        'text',
        { toolId: 1, path: FILE, kind: 'exact' },
        { toolId: 'read_file', path: FILE, kind: 'everything' },
        { toolId: 'read_file', path: FILE, kind: 'exact' },
      ]),
    );

    expect(store.listResourcePermissions()).toEqual([
      { toolId: 'read_file', path: FILE, kind: 'exact', lifetime: 'allSessions' },
    ]);
    expect(new PermissionStore(makeMemento({ not: 'a list' })).listResourcePermissions()).toEqual([]);
  });

  it('removes one grant, and only the one that is the same in every field', async () => {
    const store = new PermissionStore(makeMemento());

    await store.allowResource('read_file', FILE, 'exact', 'currentSession');
    await store.allowResource('read_file', FOLDER, 'directory', 'currentSession');
    await store.removeResourcePermission({
      toolId: 'read_file',
      path: FILE,
      kind: 'exact',
      lifetime: 'currentSession',
    });

    expect(store.listResourcePermissions().map((grant) => grant.path)).toEqual([FOLDER]);

    await store.removeResourcePermission({
      toolId: 'read_file',
      path: FOLDER,
      kind: 'exact',
      lifetime: 'currentSession',
    });
    expect(store.listResourcePermissions()).toHaveLength(1);
  });

  it('clears the grants of one lifetime, or everything', async () => {
    const memento = makeMemento();
    const store = new PermissionStore(memento);

    await store.allowResource('read_file', FILE, 'exact', 'currentSession');
    await store.allowResource('read_file', FOLDER, 'directory', 'allSessions');
    await store.clearResourcePermissions('currentSession');

    expect(store.listResourcePermissions().map((grant) => grant.lifetime)).toEqual(['allSessions']);

    await store.set('t', 'allow', 'currentSession');
    await store.clearAll('allSessions');
    await store.clearAll('currentSession');

    expect(store.listResourcePermissions()).toEqual([]);
    expect(store.list()).toEqual([]);
  });
});
