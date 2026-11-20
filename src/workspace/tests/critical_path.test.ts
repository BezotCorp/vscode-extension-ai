import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ folders: undefined as { uri: { scheme: string; fsPath: string } }[] | undefined }));

vi.mock('vscode', () => ({
  workspace: {
    get workspaceFolders() {
      return state.folders;
    },
  },
}));

import { describeCriticalPath } from '../critical_path';
import type { ResolvedPath } from '../resolved_path';

const home = os.homedir();
const project = path.join(home, 'critical-path-test-project');

function resolved(fsPath: string, scheme = 'file'): ResolvedPath {
  return { uri: { scheme, fsPath } as ResolvedPath['uri'], insideCurrentWindow: false };
}

describe('describeCriticalPath', () => {
  beforeEach(() => {
    state.folders = [{ uri: { scheme: 'file', fsPath: project } }];
  });

  it('leaves a resource that is not a local file alone', () => {
    expect(describeCriticalPath(resolved('/etc/passwd', 'vscode-vfs'))).toBeUndefined();
  });

  it('is critical for the home folder and for its parents, the filesystem root included', () => {
    expect(describeCriticalPath(resolved(home))).toBe('the home folder or one of its parents');
    expect(describeCriticalPath(resolved(path.dirname(home)))).toBe('the home folder or one of its parents');
    expect(describeCriticalPath(resolved(path.parse(home).root))).toBe('the home folder or one of its parents');
  });

  it('is critical for a folder of the current window and for its parents', () => {
    state.folders = [{ uri: { scheme: 'file', fsPath: path.join(home, 'a', 'b') } }];

    expect(describeCriticalPath(resolved(path.join(home, 'a', 'b')))).toBe(
      'a folder of the current window or one of its parents',
    );
    expect(describeCriticalPath(resolved(path.join(home, 'a')))).toBe(
      'a folder of the current window or one of its parents',
    );
  });

  it('is not critical for an ordinary file below a folder of the window', () => {
    expect(describeCriticalPath(resolved(path.join(project, 'src', 'a.ts')))).toBeUndefined();
  });

  it('is critical for the repository metadata of a folder of the window', () => {
    expect(describeCriticalPath(resolved(path.join(project, '.git')))).toBe('the repository metadata (.git)');
    expect(describeCriticalPath(resolved(path.join(project, '.git', 'config')))).toBe('the repository metadata (.git)');
  });

  it('is critical for a system location even inside the user folders', () => {
    state.folders = undefined;

    if (process.platform === 'linux') {
      expect(describeCriticalPath(resolved('/etc/passwd'))).toBe('a system location');
      expect(describeCriticalPath(resolved('/usr/bin/env'))).toBe('a system location');
    }
  });

  it('is not critical elsewhere', () => {
    state.folders = undefined;

    expect(describeCriticalPath(resolved(path.join(home, 'elsewhere', 'a.ts')))).toBeUndefined();
  });

  it('ignores the folders of the window that are not local', () => {
    state.folders = [{ uri: { scheme: 'vscode-vfs', fsPath: path.join(home, 'remote') } }];

    expect(describeCriticalPath(resolved(path.join(home, 'remote', 'a.ts')))).toBeUndefined();
  });
});
