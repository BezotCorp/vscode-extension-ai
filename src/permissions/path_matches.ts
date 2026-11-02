import * as os from 'node:os';
import * as path from 'node:path';

import { globMatches } from './glob_matches';

// Pattern forms: "//abs/path", "~/path", "/path" or "path" from a workspace folder, and a bare name or glob without
// "/" such as ".env" or "*.pem", which matches any path segment (so ".git" covers everything inside .git).
export function pathMatches(pattern: string, target: string, workspaceRoots: string[]): boolean {
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

  return workspaceRoots.some((root) => globMatches(path.join(root, relative.replace(/^\//, '')), resolved));
}
