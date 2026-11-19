import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    parse: (value: string) => {
      const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/]*)(\/.*)?$/.exec(value);

      if (!match) {
        throw new Error('not a URI');
      }

      return { scheme: match[1], authority: match[2], path: match[3] ?? '' };
    },
  },
}));
vi.mock('../../i18n', () => ({ t: (key: string) => key }));

import { pathMatches } from '../path_matches';

const root = path.resolve('/work/project');

describe('pathMatches on local paths', () => {
  it('matches an explicit absolute path with the // form', () => {
    expect(pathMatches('//etc/ssh', '/etc/ssh/config', [root])).toBe(true);
    expect(pathMatches('//etc/ssh', '/etc/other', [root])).toBe(false);
  });

  it('matches a home-relative path', () => {
    expect(pathMatches('~/.ssh', path.join(os.homedir(), '.ssh', 'id_rsa'), [root])).toBe(true);
    expect(pathMatches('~/.ssh', path.join(os.homedir(), 'notes'), [root])).toBe(false);
  });

  it('matches a bare name against any path segment', () => {
    expect(pathMatches('.env', path.join(root, 'a', '.env'), [root])).toBe(true);
    expect(pathMatches('*.pem', path.join(root, 'keys', 'a.pem'), [root])).toBe(true);
    expect(pathMatches('.env', path.join(root, 'a', 'env.txt'), [root])).toBe(false);
  });

  it('matches a workspace-relative pattern only inside a workspace folder', () => {
    expect(pathMatches('/src', path.join(root, 'src', 'a.ts'), [root])).toBe(true);
    expect(pathMatches('src/lib', path.join(root, 'src', 'lib', 'a.ts'), [root])).toBe(true);
    expect(pathMatches('/src', path.resolve('/elsewhere/src/a.ts'), [root])).toBe(false);
  });

  it('ignores non-file workspace folders for a local path', () => {
    expect(pathMatches('/src', path.join(root, 'src', 'a.ts'), ['vscode-vfs://host/repo'])).toBe(false);
  });

  it('removes a leading ./ from the pattern', () => {
    expect(pathMatches('./.env', path.join(root, '.env'), [root])).toBe(true);
  });
});

describe('pathMatches on URI resources', () => {
  const folder = 'vscode-vfs://github/owner/repo';
  const file = 'vscode-vfs://github/owner/repo/src/a.ts';

  it('never matches an OS path or a home-relative pattern', () => {
    expect(pathMatches('//owner/repo', file, [folder])).toBe(false);
    expect(pathMatches('~/repo', file, [folder])).toBe(false);
  });

  it('matches a bare name against a URI path segment', () => {
    expect(pathMatches('a.ts', file, [folder])).toBe(true);
    expect(pathMatches('b.ts', file, [folder])).toBe(false);
  });

  it('matches a folder-relative pattern in the same scheme and authority', () => {
    expect(pathMatches('/src', file, [folder])).toBe(true);
    expect(pathMatches('/src', file, ['vscode-vfs://other/owner/repo'])).toBe(false);
    expect(pathMatches('/src', file, ['file:///owner/repo'])).toBe(false);
  });

  it('does not take a Windows drive path for a URI', () => {
    expect(pathMatches('//C:/x', 'C:\\x\\a.txt', [])).toBe(false);
  });
});
