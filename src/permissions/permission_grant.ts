import { PermissionCapability, PermissionScope } from '.';

export type PermissionPersistence = 'session' | 'always';

export type PermissionGrant = {
  capability: PermissionCapability;
  scope: PermissionScope;
  persistence: PermissionPersistence;
};
