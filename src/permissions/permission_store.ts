import * as vscode from 'vscode';

import { PermissionEntry, PermissionPolicy, PermissionResolution, PermissionScope } from '.';

const WORKSPACE_KEY = 'bezotcorpAi.toolPermissions';
const SETTING = 'permissions';
const SCOPES_BY_PRIORITY: PermissionScope[] = ['session', 'workspace', 'global'];

// Decisions about tools, by tool identity. Session decisions live in memory, workspace decisions in the workspace
// state, global decisions in the user setting bezotcorpAi.permissions (which the manager edits).
export class PermissionStore {
  private readonly session = new Map<string, PermissionPolicy>();

  constructor(private readonly workspaceState: vscode.Memento) {}

  get(toolId: string, scope: PermissionScope): PermissionPolicy | undefined {
    return this.read(scope).get(toolId);
  }

  // A deny at any scope wins. Otherwise the most specific scope decides: session, then workspace, then global.
  resolve(toolId: string): PermissionResolution | undefined {
    const decisions = SCOPES_BY_PRIORITY.flatMap((scope) => {
      const policy = this.get(toolId, scope);

      return policy ? [{ policy, scope }] : [];
    });

    return decisions.find((decision) => decision.policy === 'deny') ?? decisions[0];
  }

  async set(toolId: string, policy: PermissionPolicy, scope: PermissionScope): Promise<void> {
    const decisions = this.read(scope);

    decisions.set(toolId, policy);
    await this.write(scope, decisions);
  }

  async clear(toolId: string, scope: PermissionScope): Promise<void> {
    const decisions = this.read(scope);

    if (decisions.delete(toolId)) {
      await this.write(scope, decisions);
    }
  }

  async clearScope(scope: PermissionScope): Promise<void> {
    await this.write(scope, new Map());
  }

  list(): PermissionEntry[] {
    return SCOPES_BY_PRIORITY.flatMap((scope) =>
      [...this.read(scope).entries()].map(([toolId, policy]) => ({ toolId, policy, scope })),
    );
  }

  private read(scope: PermissionScope): Map<string, PermissionPolicy> {
    switch (scope) {
      case 'session':
        return this.session;
      case 'workspace':
        return toMap(this.workspaceState.get<unknown>(WORKSPACE_KEY, {}));
      case 'global':
        // User settings only: a workspace file cannot grant a tool.
        return toMap(vscode.workspace.getConfiguration('bezotcorpAi').inspect<unknown>(SETTING)?.globalValue);
    }
  }

  private async write(scope: PermissionScope, decisions: Map<string, PermissionPolicy>): Promise<void> {
    const value = Object.fromEntries(decisions);

    switch (scope) {
      case 'session':
        return;
      case 'workspace':
        await this.workspaceState.update(WORKSPACE_KEY, value);
        return;
      case 'global':
        await vscode.workspace
          .getConfiguration('bezotcorpAi')
          .update(SETTING, value, vscode.ConfigurationTarget.Global);
    }
  }
}

function toMap(value: unknown): Map<string, PermissionPolicy> {
  const decisions = new Map<string, PermissionPolicy>();

  if (typeof value === 'object' && value !== null) {
    for (const [toolId, policy] of Object.entries(value)) {
      if (policy === 'allow' || policy === 'ask' || policy === 'deny') {
        decisions.set(toolId, policy);
      }
    }
  }

  return decisions;
}
