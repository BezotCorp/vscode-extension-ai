import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({ added: undefined as unknown, folders: [] as { uri: unknown }[] | undefined }));

vi.mock('vscode', () => ({
  Uri: {
    parse: (value: string) => {
      const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)/.exec(value);

      if (!match) {
        throw new Error('not a URI');
      }

      return { scheme: match[1], authority: match[2], path: match[3], toString: () => value };
    },
  },
  workspace: {
    getConfiguration: () => ({ inspect: () => ({ globalValue: config.added }) }),
    get workspaceFolders() {
      return config.folders;
    },
  },
}));
vi.mock('../../i18n', () => ({ t: (key: string) => key }));

import { DEFAULT_PROTECTED } from '../protected_resource_patterns';
import { getProtectedPatterns, isProtectedResource } from '../protected_resources';

const root = path.resolve('/work/project');

describe('protected resources', () => {
  beforeEach(() => {
    config.added = undefined;
    config.folders = [{ uri: { scheme: 'file', fsPath: root, toString: () => `file://${root}` } }];
  });

  it('lists the built-in patterns followed by the ones the user added', () => {
    config.added = ['secrets/'];

    expect(getProtectedPatterns()).toEqual([...DEFAULT_PROTECTED, 'secrets/']);
  });

  it('ignores an added setting that is not a list of strings', () => {
    config.added = 'nope';
    expect(getProtectedPatterns()).toEqual(DEFAULT_PROTECTED);

    config.added = ['ok', 3, null];
    expect(getProtectedPatterns()).toEqual([...DEFAULT_PROTECTED, 'ok']);
  });

  it('protects credentials, keys and repository internals', () => {
    expect(isProtectedResource(path.join(root, '.env'))).toBe('.env');
    expect(isProtectedResource(path.join(root, 'config', 'prod.pem'))).toBe('*.pem');
    expect(isProtectedResource(path.join(root, '.git', 'config'))).toBe('.git');
    expect(isProtectedResource(path.join(root, '.ssh', 'id_rsa'))).toBeDefined();
  });

  it('does not protect an ordinary file', () => {
    expect(isProtectedResource(path.join(root, 'src', 'index.ts'))).toBeUndefined();
  });

  it('exempts a template file from the built-in rules that match its name', () => {
    expect(isProtectedResource(path.join(root, '.env.example'))).toBeUndefined();
    expect(isProtectedResource(path.join(root, 'server.pem.sample'))).toBeUndefined();
  });

  it('still protects a template below a protected ancestor', () => {
    expect(isProtectedResource(path.join(root, '.ssh', 'config.example'))).toBe('.ssh');
  });

  it('lets an explicit user rule win, even over a template', () => {
    config.added = ['*.example'];

    expect(isProtectedResource(path.join(root, '.env.example'))).toBe('*.example');
  });

  it('protects a URI resource with the same patterns', () => {
    expect(isProtectedResource('vscode-vfs://github/owner/repo/.env')).toBe('.env');
    expect(isProtectedResource('vscode-vfs://github/owner/repo/.env.example')).toBeUndefined();
    expect(isProtectedResource('vscode-vfs://github/owner/repo/src/a.ts')).toBeUndefined();
  });

  it('works without any workspace folder', () => {
    config.folders = undefined;

    expect(isProtectedResource(path.resolve('/tmp/.env'))).toBe('.env');
  });
});
