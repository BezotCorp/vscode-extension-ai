import * as os from 'node:os';
import * as path from 'node:path';
import type * as vscode from 'vscode';

import { parseResourceUri } from '../workspace';
import { globMatches } from './glob_matches';

// Pattern forms:
//
// "//abs/path"
//   Explicit local absolute path.
//
// "~/path"
//   Local path relative to the user's home directory.
//
// "/path" or "path/to/file"
//   Relative to a VS Code workspace folder.
//
// ".env", "*.pem", ...
//   A bare name/glob matching any resource path segment.
//
// Local resources use native path semantics.
// Non-file VS Code resources use URI scheme + authority + POSIX URI paths.
export function pathMatches(pattern: string, target: string, workspaceRoots: string[]): boolean {
  const targetUri = parseResourceUri(target);

  if (targetUri) {
    return uriPathMatches(pattern, targetUri, workspaceRoots);
  }

  return localPathMatches(pattern, target, workspaceRoots);
}

function localPathMatches(pattern: string, target: string, workspaceRoots: string[]): boolean {
  const resolved = path.resolve(target);

  if (pattern.startsWith('//')) {
    return globMatches(pattern.slice(1), resolved);
  }

  if (pattern.startsWith('~/')) {
    return globMatches(path.join(os.homedir(), pattern.slice(2)), resolved);
  }

  const relative = pattern.replace(/^\.\//, '');

  if (!pattern.startsWith('/') && !relative.includes('/')) {
    return resolved.split(path.sep).some((segment) => segment !== '' && globMatches(relative, segment));
  }

  return workspaceRoots
    .filter((root) => parseResourceUri(root) === undefined)
    .some((root) => globMatches(path.join(root, relative.replace(/^\//, '')), resolved));
}

function uriPathMatches(pattern: string, target: vscode.Uri, workspaceRoots: string[]): boolean {
  // Explicit OS paths and home-relative paths have no meaning in a
  // non-file filesystem provider.
  if (pattern.startsWith('//') || pattern.startsWith('~/')) {
    return false;
  }

  const relative = pattern.replace(/^\.\//, '');

  if (!pattern.startsWith('/') && !relative.includes('/')) {
    return target.path.split('/').some((segment) => segment !== '' && globMatches(relative, segment));
  }

  return workspaceRoots
    .map(parseResourceUri)
    .filter((root): root is vscode.Uri => root !== undefined)
    .filter((root) => root.scheme === target.scheme && root.authority === target.authority)
    .some((root) => {
      const candidate = path.posix.join(root.path, relative.replace(/^\//, ''));

      return globMatches(candidate, target.path);
    });
}
