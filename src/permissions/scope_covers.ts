import * as path from 'node:path';

import { PermissionScope } from '.';

export function scopeCovers(grant: PermissionScope, target: PermissionScope): boolean {
  if (grant.kind === target.kind && grant.value === target.value) {
    return true;
  }

  switch (grant.kind) {
    case 'folder':
    case 'workspace':
      return (target.kind === 'file' || target.kind === 'folder') && isInside(grant.value, target.value);
    case 'mcpServer':
      return target.kind === 'mcpTool' && target.value.startsWith(`${grant.value}/`);
    case 'command':
      return target.kind === 'command' && target.value.startsWith(`${grant.value} `);
    default:
      return false;
  }
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);

  return !relative.startsWith('..') && !path.isAbsolute(relative);
}
