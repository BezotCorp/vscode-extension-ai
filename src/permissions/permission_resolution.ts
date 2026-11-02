import { PermissionPolicy, PermissionScope } from '.';

// The decision that applies to a tool, and the scope it comes from.
export type PermissionResolution = {
  policy: PermissionPolicy;
  scope: PermissionScope;
};
