import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('../../tools/tests/support/fake_vscode')).fakeVscode);

import { FakeUri, fakeVscode, openFolder } from '../../tools/tests/support/fake_vscode';
import { getWorkspaceRoot, getWorkspaceRoots, resolvePath } from '../resolve_path';

let base: string;
let first: string;
let second: string;

function openFolders(...folders: string[]): void {
  openFolder(folders[0] ?? '');
  fakeVscode.workspace.workspaceFolders = folders.map((folder, index) => ({
    uri: FakeUri.file(folder),
    name: path.basename(folder),
    index,
  }));
}

describe('resolvePath', () => {
  beforeEach(async () => {
    base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bezotcorp-resolve-')));
    first = path.join(base, 'first');
    second = path.join(base, 'second');
    await fs.mkdir(first);
    await fs.mkdir(second);
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it('lists the folders of the window, and the first one as the root', () => {
    openFolders(first, second);

    expect(getWorkspaceRoots().map((uri) => uri.fsPath)).toEqual([first, second]);
    expect(getWorkspaceRoot()?.fsPath).toBe(first);
  });

  it('has no root when no folder is open', () => {
    fakeVscode.workspace.workspaceFolders = undefined;

    expect(getWorkspaceRoots()).toEqual([]);
    expect(getWorkspaceRoot()).toBeUndefined();
  });

  it('resolves a relative path against the folder of the window', async () => {
    openFolders(first);

    const resolved = await resolvePath('src/a.ts');

    expect(resolved.uri.fsPath).toBe(path.join(first, 'src', 'a.ts'));
    expect(resolved.insideCurrentWindow).toBe(true);
    expect(resolved.currentWindowRoot?.fsPath).toBe(first);
  });

  it('accepts backslashes in a relative path', async () => {
    openFolders(first);

    expect((await resolvePath('src\\a.ts')).uri.fsPath).toBe(path.join(first, 'src', 'a.ts'));
  });

  it('does not let a relative path leave the folder unnoticed: it is then outside the window', async () => {
    openFolders(first);

    const resolved = await resolvePath('../second/a.ts');

    expect(resolved.uri.fsPath).toBe(path.join(second, 'a.ts'));
    expect(resolved.insideCurrentWindow).toBe(false);
    expect(resolved.currentWindowRoot).toBeUndefined();
  });

  it('takes an absolute path as it is and tells whether it is inside the window', async () => {
    openFolders(first);

    expect((await resolvePath(path.join(first, 'a.ts'))).insideCurrentWindow).toBe(true);
    expect((await resolvePath(path.join(second, 'a.ts'))).insideCurrentWindow).toBe(false);
  });

  it('follows a symbolic link, so a link out of the folder is not inside the window', async () => {
    openFolders(first);
    await fs.writeFile(path.join(second, 'secret.txt'), 'x');
    await fs.symlink(second, path.join(first, 'link'));

    const resolved = await resolvePath('link/secret.txt');

    expect(resolved.uri.fsPath).toBe(path.join(second, 'secret.txt'));
    expect(resolved.insideCurrentWindow).toBe(false);
  });

  it('resolves a path that does not exist yet from its closest existing parent', async () => {
    openFolders(first);
    await fs.symlink(second, path.join(first, 'link'));

    expect((await resolvePath('link/new/dir/file.txt')).uri.fsPath).toBe(path.join(second, 'new', 'dir', 'file.txt'));
  });

  it('chooses the folder named by the first segment when several are open', async () => {
    openFolders(first, second);

    const resolved = await resolvePath('second/a.ts');

    expect(resolved.uri.fsPath).toBe(path.join(second, 'a.ts'));
    expect(resolved.currentWindowRoot?.fsPath).toBe(second);
  });

  it('chooses the folder where the relative path exists when several are open', async () => {
    openFolders(first, second);
    await fs.writeFile(path.join(second, 'only-here.txt'), 'x');

    expect((await resolvePath('only-here.txt')).uri.fsPath).toBe(path.join(second, 'only-here.txt'));
  });

  it('falls back to the first folder when the path exists in none', async () => {
    openFolders(first, second);

    expect((await resolvePath('nowhere.txt')).uri.fsPath).toBe(path.join(first, 'nowhere.txt'));
  });

  it('takes a path that is only the name of a folder for a path inside the first folder', async () => {
    openFolders(first, second);

    expect((await resolvePath('second')).uri.fsPath).toBe(path.join(first, 'second'));
  });

  it('keeps an explicit URI of another scheme as it is', async () => {
    openFolders(first);

    const resolved = await resolvePath('vscode-vfs://github/owner/repo/a.ts');

    expect(resolved.uri.toString()).toBe('vscode-vfs://github/owner/repo/a.ts');
    expect(resolved.insideCurrentWindow).toBe(false);
  });

  it('fails with a clear code when no folder is open and the path is relative', async () => {
    fakeVscode.workspace.workspaceFolders = undefined;

    await expect(resolvePath('a.ts')).rejects.toMatchObject({ code: 'NoWorkspace' });
  });

  it('still resolves an absolute path when no folder is open', async () => {
    fakeVscode.workspace.workspaceFolders = undefined;

    expect((await resolvePath(path.join(first, 'a.ts'))).insideCurrentWindow).toBe(false);
  });

  it('reports the structural workspace around a path that is outside the window', async () => {
    openFolders(path.join(base, 'elsewhere'));
    await fs.mkdir(path.join(base, 'elsewhere'));
    await fs.writeFile(path.join(base, 'pnpm-workspace.yaml'), 'packages: []');

    const resolved = await resolvePath(path.join(second, 'a.ts'));

    expect(resolved.insideCurrentWindow).toBe(false);
    expect(resolved.structuralWorkspace).toMatchObject({ kind: 'pnpm' });
  });

  it('does not look for a structural workspace around a path inside the window', async () => {
    openFolders(first);
    await fs.writeFile(path.join(base, 'pnpm-workspace.yaml'), 'packages: []');

    expect((await resolvePath('a.ts')).structuralWorkspace).toBeUndefined();
  });
});
