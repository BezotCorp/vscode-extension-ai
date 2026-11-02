import { PermissionPolicy, PermissionScope } from '.';

export type PermissionEntry = {
  // Identity of the tool the decision is about.
  toolId: string;
  policy: PermissionPolicy;
  scope: PermissionScope;
};
