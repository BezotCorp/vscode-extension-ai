import * as vscode from 'vscode';

import { PermissionGrant, PermissionStore } from '.';
import { describeScope } from './describe_scope';

type GrantItem = vscode.QuickPickItem & { grant: PermissionGrant };

export async function managePermissions(store: PermissionStore): Promise<void> {
  const grants = store.list();

  if (grants.length === 0) {
    await vscode.window.showInformationMessage('BezotCorp AI: no saved permissions.');
    return;
  }

  const items: GrantItem[] = grants.map((grant) => ({
    label: `${grant.capability}: ${describeScope(grant.scope)}`,
    description: grant.persistence === 'always' ? 'always' : 'this session',
    grant,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: 'BezotCorp AI permissions',
    placeHolder: 'Select permissions to revoke',
  });

  if (!selected || selected.length === 0) {
    return;
  }

  for (const item of selected) {
    await store.revoke(item.grant);
  }

  await vscode.window.showInformationMessage(`BezotCorp AI: revoked ${selected.length} permission(s).`);
}
