import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as vscode from 'vscode';

export type PathMode = 'native' | 'posix';

// A parent traversal must start with a complete ".." segment.
export function isParentRelative(relative: string, mode: PathMode): boolean {
  const separator = mode === 'native' ? path.sep : '/';

  return relative === '..' || relative.startsWith(`..${separator}`);
}

// Compare URI paths using either native filesystem or POSIX URI semantics.
export function isUriInside(parent: vscode.Uri, child: vscode.Uri, mode: 'filesystem' | 'uri'): boolean {
  if (parent.scheme !== child.scheme || parent.authority !== child.authority) {
    return false;
  }

  const native = mode === 'filesystem' && parent.scheme === 'file';
  const relative = native ? path.relative(parent.fsPath, child.fsPath) : path.posix.relative(parent.path, child.path);

  const style = native ? path : path.posix;

  return relative === '' || (!isParentRelative(relative, native ? 'native' : 'posix') && !style.isAbsolute(relative));
}

// Preserve the original fallback selected by each caller.
export function realPathOrFallback(target: string, fallback: 'absolute' | 'original'): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return fallback === 'absolute' ? path.resolve(target) : target;
  }
}
