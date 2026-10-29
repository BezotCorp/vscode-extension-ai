import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { ResolvedPath } from '.';

export function resolvePath(inputPath: string): ResolvedPath {
  const root = getWorkspaceRoot();

  if (!root && !path.isAbsolute(inputPath)) {
    throw Object.assign(new Error('No workspace folder is open.'), { code: 'NoWorkspace' });
  }

  const realRoot = root === undefined ? undefined : realPath(root);
  const target = realPath(path.resolve(root ?? '/', inputPath));

  return {
    uri: vscode.Uri.file(target),
    insideWorkspace: realRoot !== undefined && isInside(realRoot, target),
    workspaceRoot: realRoot,
  };
}

export function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
