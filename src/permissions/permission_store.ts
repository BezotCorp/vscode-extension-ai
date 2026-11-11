import * as path from 'node:path';
import * as vscode from 'vscode';

import { parseResourceUri } from '../workspace';

import type {
  PermissionEntry,
  PermissionLifetime,
  PermissionPolicy,
  PermissionResolution,
  ResourcePermissionGrant,
  ResourcePermissionKind,
} from '.';
import { PERMISSION_LIFETIMES } from './permission_lifetimes';
import { RESOURCE_KEY, TOOL_SETTING } from './permission_storage_keys';

export class PermissionStore {
  private readonly sessionTools = new Map<string, PermissionPolicy>();

  private readonly sessionResources: ResourcePermissionGrant[] = [];

  constructor(private readonly globalState: vscode.Memento) {}

  get(toolId: string, lifetime: PermissionLifetime): PermissionPolicy | undefined {
    return this.readToolDecisions(lifetime).get(toolId);
  }

  resolve(toolId: string): PermissionResolution | undefined {
    const decisions = PERMISSION_LIFETIMES.flatMap((lifetime) => {
      const policy = this.get(toolId, lifetime);

      return policy
        ? [
            {
              policy,
              lifetime,
            },
          ]
        : [];
    });

    return decisions.find((decision) => decision.policy === 'deny') ?? decisions[0];
  }

  async set(toolId: string, policy: PermissionPolicy, lifetime: PermissionLifetime): Promise<void> {
    const decisions = this.readToolDecisions(lifetime);

    decisions.set(toolId, policy);

    await this.writeToolDecisions(lifetime, decisions);
  }

  async clear(toolId: string, lifetime: PermissionLifetime): Promise<void> {
    const decisions = this.readToolDecisions(lifetime);

    if (!decisions.delete(toolId)) {
      return;
    }

    await this.writeToolDecisions(lifetime, decisions);
  }

  async clearToolDecisions(lifetime: PermissionLifetime): Promise<void> {
    await this.writeToolDecisions(lifetime, new Map());
  }

  list(): PermissionEntry[] {
    return PERMISSION_LIFETIMES.flatMap((lifetime) =>
      [...this.readToolDecisions(lifetime).entries()].map(([toolId, policy]) => ({
        toolId,
        policy,
        lifetime,
      })),
    );
  }

  listResourcePermissions(): ResourcePermissionGrant[] {
    return [...this.sessionResources, ...this.readAllSessionsResources()];
  }

  isResourceAllowed(toolId: string, target: string): ResourcePermissionGrant | undefined {
    const normalized = normalizeResource(target);

    const session = [...this.sessionResources]
      .reverse()
      .find((grant) => grant.toolId === toolId && grantCovers(grant, normalized));

    if (session) {
      return session;
    }

    return this.readAllSessionsResources()
      .reverse()
      .find((grant) => grant.toolId === toolId && grantCovers(grant, normalized));
  }

  async allowResource(
    toolId: string,
    target: string,
    kind: ResourcePermissionKind,
    lifetime: PermissionLifetime,
  ): Promise<void> {
    const grant: ResourcePermissionGrant = {
      toolId,
      path: normalizeResource(target),
      kind,
      lifetime,
    };

    const grants = lifetime === 'currentSession' ? [...this.sessionResources] : this.readAllSessionsResources();

    const filtered = grants.filter(
      (candidate) =>
        !(candidate.toolId === grant.toolId && candidate.path === grant.path && candidate.kind === grant.kind),
    );

    filtered.push(grant);

    await this.writeResources(lifetime, filtered);
  }

  async removeResourcePermission(grant: ResourcePermissionGrant): Promise<void> {
    const grants = grant.lifetime === 'currentSession' ? [...this.sessionResources] : this.readAllSessionsResources();

    await this.writeResources(
      grant.lifetime,
      grants.filter((candidate) => !sameGrant(candidate, grant)),
    );
  }

  async clearResourcePermissions(lifetime: PermissionLifetime): Promise<void> {
    await this.writeResources(lifetime, []);
  }

  async clearAll(lifetime: PermissionLifetime): Promise<void> {
    await this.clearToolDecisions(lifetime);

    await this.clearResourcePermissions(lifetime);
  }

  private readToolDecisions(lifetime: PermissionLifetime): Map<string, PermissionPolicy> {
    switch (lifetime) {
      case 'currentSession':
        return new Map(this.sessionTools);

      case 'allSessions':
        return toToolMap(vscode.workspace.getConfiguration('bezotcorpAi').inspect<unknown>(TOOL_SETTING)?.globalValue);
    }
  }

  private async writeToolDecisions(
    lifetime: PermissionLifetime,
    decisions: Map<string, PermissionPolicy>,
  ): Promise<void> {
    if (lifetime === 'currentSession') {
      this.sessionTools.clear();

      for (const [toolId, policy] of decisions) {
        this.sessionTools.set(toolId, policy);
      }

      return;
    }

    await vscode.workspace
      .getConfiguration('bezotcorpAi')
      .update(TOOL_SETTING, Object.fromEntries(decisions), vscode.ConfigurationTarget.Global);
  }

  private readAllSessionsResources(): ResourcePermissionGrant[] {
    const value = this.globalState.get<unknown>(RESOURCE_KEY, []);

    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((entry) => parseResourceGrant(entry, 'allSessions'));
  }

  private async writeResources(lifetime: PermissionLifetime, grants: ResourcePermissionGrant[]): Promise<void> {
    if (lifetime === 'currentSession') {
      this.sessionResources.splice(0, this.sessionResources.length, ...grants);

      return;
    }

    await this.globalState.update(
      RESOURCE_KEY,
      grants.map(({ toolId, path, kind }) => ({
        toolId,
        path,
        kind,
      })),
    );
  }
}

function toToolMap(value: unknown): Map<string, PermissionPolicy> {
  const result = new Map<string, PermissionPolicy>();

  if (typeof value !== 'object' || value === null) {
    return result;
  }

  for (const [toolId, policy] of Object.entries(value)) {
    if (policy === 'allow' || policy === 'ask' || policy === 'deny') {
      result.set(toolId, policy);
    }
  }

  return result;
}

function parseResourceGrant(value: unknown, lifetime: PermissionLifetime): ResourcePermissionGrant[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.toolId !== 'string' || typeof candidate.path !== 'string' || !isResourceKind(candidate.kind)) {
    return [];
  }

  return [
    {
      toolId: candidate.toolId,

      path: normalizeResource(candidate.path),

      kind: candidate.kind,

      lifetime,
    },
  ];
}

function isResourceKind(value: unknown): value is ResourcePermissionKind {
  return value === 'exact' || value === 'directory' || value === 'structuralWorkspace';
}

function grantCovers(grant: ResourcePermissionGrant, target: string): boolean {
  const parent = normalizeResource(grant.path);

  if (grant.kind === 'exact') {
    return parent === target;
  }

  const parentUri = parseResourceUri(parent);

  const targetUri = parseResourceUri(target);

  if (parentUri || targetUri) {
    if (
      !parentUri ||
      !targetUri ||
      parentUri.scheme !== targetUri.scheme ||
      parentUri.authority !== targetUri.authority
    ) {
      return false;
    }

    const relative = path.posix.relative(parentUri.path, targetUri.path);

    return relative === '' || (!(relative === '..' || relative.startsWith('../')) && !path.posix.isAbsolute(relative));
  }

  const relative = path.relative(parent, target);

  return (
    relative === '' || (!(relative === '..' || relative.startsWith(`..${path.sep}`)) && !path.isAbsolute(relative))
  );
}

function normalizeResource(value: string): string {
  const uri = parseResourceUri(value);

  if (!uri) {
    return path.resolve(value);
  }

  return uri
    .with({
      query: '',
      fragment: '',
    })
    .toString();
}

function sameGrant(left: ResourcePermissionGrant, right: ResourcePermissionGrant): boolean {
  return (
    left.toolId === right.toolId &&
    left.path === right.path &&
    left.kind === right.kind &&
    left.lifetime === right.lifetime
  );
}
