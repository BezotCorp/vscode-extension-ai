import * as vscode from 'vscode';

import { PermissionCapability, PermissionGrant, PermissionPersistence, PermissionScope } from '.';
import { scopeCovers } from './scope_covers';

const STORAGE_KEY = 'bezotcorpAi.permissionGrants';

export class PermissionStore {
  private readonly sessionGrants: PermissionGrant[] = [];

  constructor(private readonly memento: vscode.Memento) {}

  isGranted(capability: PermissionCapability, target: PermissionScope): boolean {
    return this.list().some((grant) => grant.capability === capability && scopeCovers(grant.scope, target));
  }

  async grant(
    capability: PermissionCapability,
    scope: PermissionScope,
    persistence: PermissionPersistence,
  ): Promise<void> {
    const grant: PermissionGrant = { capability, scope, persistence };

    if (this.list().some((existing) => isSameGrant(existing, grant))) {
      return;
    }

    if (persistence === 'session') {
      this.sessionGrants.push(grant);
      return;
    }

    await this.memento.update(STORAGE_KEY, [...this.loadPersistent(), grant]);
  }

  list(): PermissionGrant[] {
    return [...this.loadPersistent(), ...this.sessionGrants];
  }

  async revoke(grant: PermissionGrant): Promise<void> {
    const sessionIndex = this.sessionGrants.findIndex((existing) => isSameGrant(existing, grant));

    if (sessionIndex >= 0) {
      this.sessionGrants.splice(sessionIndex, 1);
    }

    await this.memento.update(
      STORAGE_KEY,
      this.loadPersistent().filter((existing) => !isSameGrant(existing, grant)),
    );
  }

  async revokeAll(): Promise<void> {
    this.sessionGrants.length = 0;
    await this.memento.update(STORAGE_KEY, []);
  }

  private loadPersistent(): PermissionGrant[] {
    return this.memento.get<PermissionGrant[]>(STORAGE_KEY, []).filter((grant) => grant.persistence === 'always');
  }
}

function isSameGrant(left: PermissionGrant, right: PermissionGrant): boolean {
  return (
    left.capability === right.capability &&
    left.scope.kind === right.scope.kind &&
    left.scope.value === right.scope.value &&
    left.persistence === right.persistence
  );
}
