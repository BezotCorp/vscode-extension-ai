import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('../../tools/tests/support/fake_vscode')).fakeVscode);

import { FakeUri } from '../../tools/tests/support/fake_vscode';
import { detectStructuralWorkspace } from '../detect_structural_workspace';
import { MAX_MANIFEST_BYTES } from '../structural_workspace_limits';

let base: string;

const uri = (...segments: string[]) => FakeUri.file(path.join(base, ...segments)) as never;
const detect = (target: string[], root: string[]) => detectStructuralWorkspace(uri(...target), [uri(...root)]);

describe('detectStructuralWorkspace', () => {
  beforeEach(async () => {
    base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bezotcorp-structure-')));
    await fs.mkdir(path.join(base, 'packages', 'app'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it('finds nothing when no parent holds a workspace manifest', async () => {
    expect(await detect(['packages', 'app', 'a.ts'], ['packages', 'app'])).toBeUndefined();
  });

  it('finds a Cargo workspace, whatever form of [workspace] table it uses', async () => {
    await fs.writeFile(path.join(base, 'Cargo.toml'), '[package]\nname = "x"\n\n[workspace]\nmembers = []\n');

    const found = await detect(['packages', 'app', 'a.rs'], ['packages', 'app']);

    expect(found).toMatchObject({ kind: 'cargo' });
    expect(found?.root.toString()).toBe(uri().toString());
    expect(found?.marker.fsPath).toBe(path.join(base, 'Cargo.toml'));

    await fs.writeFile(path.join(base, 'Cargo.toml'), '[workspace.package]\nversion = "1"\n');
    expect(await detect(['packages', 'app', 'a.rs'], ['packages', 'app'])).toMatchObject({ kind: 'cargo' });
  });

  it('does not take a Cargo manifest without a workspace table for a workspace', async () => {
    await fs.writeFile(path.join(base, 'Cargo.toml'), '[package]\nname = "x"\n# [workspace]\n');

    expect(await detect(['packages', 'app', 'a.rs'], ['packages', 'app'])).toBeUndefined();
  });

  it('finds a pnpm workspace', async () => {
    await fs.writeFile(path.join(base, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');

    expect(await detect(['packages', 'app', 'a.ts'], ['packages', 'app'])).toMatchObject({ kind: 'pnpm' });
  });

  it('finds a Node workspace declared as an array or as an object, not a plain package', async () => {
    await fs.writeFile(path.join(base, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }));
    expect(await detect(['packages', 'app', 'a.ts'], ['packages', 'app'])).toMatchObject({ kind: 'node' });

    await fs.writeFile(path.join(base, 'package.json'), JSON.stringify({ workspaces: { packages: [] } }));
    expect(await detect(['packages', 'app', 'a.ts'], ['packages', 'app'])).toMatchObject({ kind: 'node' });

    await fs.writeFile(path.join(base, 'package.json'), JSON.stringify({ name: 'plain' }));
    expect(await detect(['packages', 'app', 'a.ts'], ['packages', 'app'])).toBeUndefined();
  });

  it('ignores a package.json that is not valid JSON', async () => {
    await fs.writeFile(path.join(base, 'package.json'), '{ not json');

    expect(await detect(['packages', 'app', 'a.ts'], ['packages', 'app'])).toBeUndefined();
  });

  it('ignores a manifest that is too large to be read', async () => {
    await fs.writeFile(path.join(base, 'Cargo.toml'), `[workspace]\n${'#'.repeat(MAX_MANIFEST_BYTES)}`);

    expect(await detect(['packages', 'app', 'a.rs'], ['packages', 'app'])).toBeUndefined();
  });

  it('ignores a manifest that is a folder', async () => {
    await fs.mkdir(path.join(base, 'pnpm-workspace.yaml'));

    expect(await detect(['packages', 'app', 'a.ts'], ['packages', 'app'])).toBeUndefined();
  });

  it('prefers Cargo, then pnpm, then Node, when one folder holds several', async () => {
    await fs.writeFile(path.join(base, 'package.json'), JSON.stringify({ workspaces: [] }));
    await fs.writeFile(path.join(base, 'pnpm-workspace.yaml'), 'packages: []');
    expect(await detect(['packages', 'app', 'a.ts'], ['packages', 'app'])).toMatchObject({ kind: 'pnpm' });

    await fs.writeFile(path.join(base, 'Cargo.toml'), '[workspace]\n');
    expect(await detect(['packages', 'app', 'a.ts'], ['packages', 'app'])).toMatchObject({ kind: 'cargo' });
  });

  it('keeps the closest workspace when several parents hold one', async () => {
    await fs.writeFile(path.join(base, 'pnpm-workspace.yaml'), 'packages: []');
    await fs.writeFile(path.join(base, 'packages', 'pnpm-workspace.yaml'), 'packages: []');

    const found = await detect(['packages', 'app', 'a.ts'], ['packages', 'app']);

    expect(found?.root.fsPath).toBe(path.join(base, 'packages'));
  });

  it('does not report a workspace that does not hold the target', async () => {
    await fs.mkdir(path.join(base, 'packages', 'other'));
    await fs.writeFile(path.join(base, 'packages', 'app', 'pnpm-workspace.yaml'), 'packages: []');

    expect(await detect(['packages', 'other', 'a.ts'], ['packages', 'app'])).toBeUndefined();
  });
});
