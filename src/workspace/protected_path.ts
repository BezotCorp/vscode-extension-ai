import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { ResolvedPath } from '.';

// Paths that must never be deleted or moved by a tool, whatever the autonomy mode: the workspace folders, their
// the home folder and their ancestors (which includes the filesystem root), plus the repository metadata of a workspace folder.
export function describeProtectedPath(resolved: ResolvedPath): string | undefined {
  const target = path.resolve(resolved.uri.fsPath);

  if (isInsideOrSame(target, os.homedir())) {
    return 'the home folder or one of its parents';
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const root = path.resolve(folder.uri.fsPath);

    if (isInsideOrSame(target, root)) {
      return 'a workspace folder or one of its parents';
    }

    if (target === path.join(root, '.git')) {
      return 'the repository metadata (.git)';
    }
  }

  return undefined;
}

// True when child is parent itself or lies below it.
function isInsideOrSame(parent: string, child: string): boolean {
  const relative = path.relative(parent, path.resolve(child));

  return !relative.startsWith('..') && !path.isAbsolute(relative);
}
