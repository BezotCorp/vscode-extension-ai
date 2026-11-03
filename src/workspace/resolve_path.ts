import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { ResolvedPath } from '.';

// Relative paths start at the first workspace folder. In a multi-root workspace a path may also start with the
// name of a folder ("api/src/index.ts"), and a path that exists in only one folder is found there.
export function resolvePath(inputPath: string): ResolvedPath {
  const roots = getWorkspaceRoots();

  if (roots.length === 0 && !path.isAbsolute(inputPath)) {
    throw Object.assign(new Error('No workspace folder is open.'), { code: 'NoWorkspace' });
  }

  const realRoots = roots.map(realPath);
  const base = path.isAbsolute(inputPath) ? realRoots[0] : chooseRoot(inputPath, roots, realRoots);
  const target = realPath(path.resolve(base ?? '/', stripFolderName(inputPath, roots, base)));
  const container = realRoots.find((root) => isInside(root, target));

  return {
    uri: vscode.Uri.file(target),
    insideCurrentWindow: container !== undefined,
    workspaceRoot: container ?? realRoots[0],
  };
}

export function getWorkspaceRoot(): string | undefined {
  return getWorkspaceRoots()[0];
}

export function getWorkspaceRoots(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
}

function chooseRoot(inputPath: string, roots: string[], realRoots: string[]): string {
  if (roots.length > 1) {
    const [first] = inputPath.split(/[\\/]/);
    const named = (vscode.workspace.workspaceFolders ?? []).findIndex((folder) => folder.name === first);

    if (named >= 0 && inputPath.length > first.length) {
      return realRoots[named];
    }

    const existing = realRoots.find((root) => fs.existsSync(path.resolve(root, inputPath)));

    if (existing) {
      return existing;
    }
  }

  return realRoots[0];
}

// "api/src/index.ts" is a path inside the folder named "api", not a folder called "api" under the first root.
function stripFolderName(inputPath: string, roots: string[], base: string | undefined): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const [first] = inputPath.split(/[\\/]/);
  const named = folders.find((folder) => folder.name === first && realPath(folder.uri.fsPath) === base);

  return roots.length > 1 && named && inputPath.length > first.length && !fs.existsSync(path.resolve(base ?? '/', inputPath))
    ? inputPath.slice(first.length + 1)
    : inputPath;
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);

  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

// Resolves symbolic links on the nearest existing ancestor so paths that do not exist yet are checked too.
function realPath(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    const parent = path.dirname(target);

    return parent === target ? target : path.join(realPath(parent), path.basename(target));
  }
}
