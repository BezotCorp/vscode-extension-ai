import * as fs from 'node:fs';
import * as path from 'node:path';

import { StructuralWorkspace } from '.';

const MAX_MANIFEST_BYTES = 1_000_000;

export function detectStructuralWorkspace(
  target: string,
  currentWindowRoots: readonly string[],
): StructuralWorkspace | undefined {
  const targetPath = path.resolve(target);
  const roots = currentWindowRoots.map((root) => path.resolve(root));

  const candidates = new Map<string, StructuralWorkspace>();

  for (const root of roots) {
    for (const parent of parents(root)) {
      const detected = detectAt(parent);

      if (
        detected &&
        isInside(detected.root, root) &&
        isInside(detected.root, targetPath)
      ) {
        candidates.set(detected.root, detected);
      }
    }
  }

  return [...candidates.values()].sort(
    (left, right) => right.root.length - left.root.length,
  )[0];
}

function detectAt(root: string): StructuralWorkspace | undefined {
  const cargo = path.join(root, 'Cargo.toml');

  if (isFile(cargo) && cargoContainsWorkspace(cargo)) {
    return {
      kind: 'cargo',
      root,
      marker: cargo,
    };
  }

  const pnpm = path.join(root, 'pnpm-workspace.yaml');

  if (isFile(pnpm)) {
    return {
      kind: 'pnpm',
      root,
      marker: pnpm,
    };
  }

  const packageJson = path.join(root, 'package.json');

  if (isFile(packageJson) && packageContainsWorkspaces(packageJson)) {
    return {
      kind: 'node',
      root,
      marker: packageJson,
    };
  }

  return undefined;
}

function cargoContainsWorkspace(file: string): boolean {
  const text = readSmallText(file);

  return text !== undefined && /^\s*\[workspace(?:\.[^\]]+)?\]\s*$/m.test(text);
}

function packageContainsWorkspaces(file: string): boolean {
  const text = readSmallText(file);

  if (text === undefined) {
    return false;
  }

  try {
    const value = JSON.parse(text) as {
      workspaces?: unknown;
    };

    return (
      Array.isArray(value.workspaces) ||
      (
        typeof value.workspaces === 'object' &&
        value.workspaces !== null
      )
    );
  } catch {
    return false;
  }
}

function readSmallText(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);

    if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) {
      return undefined;
    }

    return fs.readFileSync(file, 'utf-8');
  } catch {
    return undefined;
  }
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function parents(start: string): string[] {
  const result: string[] = [];
  let current = path.resolve(start);

  for (;;) {
    result.push(current);

    const parent = path.dirname(current);

    if (parent === current) {
      return result;
    }

    current = parent;
  }
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(
    path.resolve(parent),
    path.resolve(child),
  );

  return (
    relative === '' ||
    (
      !relative.startsWith('..') &&
      !path.isAbsolute(relative)
    )
  );
}
