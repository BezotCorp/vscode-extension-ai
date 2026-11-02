import * as vscode from 'vscode';

import { PermissionPolicy, PermissionScope, PermissionStore, ToolPermissionInfo } from '.';

const SCOPE_LABELS: Record<PermissionScope, string> = {
  session: 'This session',
  workspace: 'This workspace',
  global: 'Everywhere (user settings)',
};
const POLICY_LABELS: Record<PermissionPolicy, string> = {
  allow: 'Allow: runs without asking',
  ask: 'Ask: confirm at each call',
  deny: 'Deny: the AI cannot use it',
};
const RESET_ITEMS: { label: string; scope: PermissionScope }[] = [
  { label: 'Reset session decisions', scope: 'session' },
  { label: 'Reset workspace decisions', scope: 'workspace' },
  { label: 'Reset global decisions', scope: 'global' },
];
const EDIT_PROTECTED = 'Edit protected paths…';

// The central place to see and change what the AI may do, tool by tool.
export async function managePermissions(store: PermissionStore, listTools: () => Promise<ToolPermissionInfo[]>) {
  for (;;) {
    const tools = await listTools();
    const picked = await vscode.window.showQuickPick(buildItems(store, tools), {
      title: 'BezotCorp AI permissions',
      placeHolder: 'Pick a tool to change what the AI may do with it',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!picked) {
      return;
    }

    if (picked.label === EDIT_PROTECTED) {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'bezotcorpAi.protectedPaths');
      return;
    }

    const reset = RESET_ITEMS.find((item) => item.label === picked.label);

    if (reset) {
      await store.clearScope(reset.scope);
      void vscode.window.showInformationMessage(`BezotCorp AI: ${reset.label.toLowerCase()} done.`);
      continue;
    }

    const tool = tools.find((candidate) => candidate.id === picked.toolId);

    if (tool) {
      await changeTool(store, tool);
    }
  }
}

function buildItems(
  store: PermissionStore,
  tools: ToolPermissionInfo[],
): (vscode.QuickPickItem & { toolId?: string })[] {
  const items: (vscode.QuickPickItem & { toolId?: string })[] = [];
  let group: string | undefined;

  for (const tool of tools) {
    if (tool.group !== group) {
      group = tool.group;
      items.push({ label: group, kind: vscode.QuickPickItemKind.Separator });
    }

    const resolution = store.resolve(tool.id);

    items.push({
      label: tool.name,
      description: resolution
        ? `${resolution.policy} · ${SCOPE_LABELS[resolution.scope].toLowerCase()}`
        : `${tool.defaultPolicy} · default`,
      detail: tool.description,
      toolId: tool.id,
    });
  }

  items.push({ label: 'Maintenance', kind: vscode.QuickPickItemKind.Separator });
  items.push(...RESET_ITEMS.map((item) => ({ label: item.label })), { label: EDIT_PROTECTED });

  return items;
}

async function changeTool(store: PermissionStore, tool: ToolPermissionInfo): Promise<void> {
  const choice = await vscode.window.showQuickPick(
    [
      ...(['allow', 'ask', 'deny'] as const).map((policy) => ({ label: POLICY_LABELS[policy], policy })),
      { label: `Use the default (${tool.defaultPolicy})`, policy: undefined },
    ],
    { title: tool.name, placeHolder: 'What may the AI do with this tool?' },
  );

  if (!choice) {
    return;
  }

  const scopes = (Object.keys(SCOPE_LABELS) as PermissionScope[]).filter(
    (scope) => choice.policy !== undefined || store.get(tool.id, scope) !== undefined,
  );

  if (scopes.length === 0) {
    void vscode.window.showInformationMessage(`BezotCorp AI: ${tool.name} already uses its default.`);
    return;
  }

  const scope = await vscode.window.showQuickPick(
    scopes.map((candidate) => ({ label: SCOPE_LABELS[candidate], scope: candidate })),
    { title: choice.policy ? `Keep this decision for…` : 'Remove the decision kept for…' },
  );

  if (!scope) {
    return;
  }

  if (choice.policy) {
    await store.set(tool.id, choice.policy, scope.scope);
  } else {
    await store.clear(tool.id, scope.scope);
  }
}
