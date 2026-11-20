import type { PermissionPolicy } from '.';

// A tool as the permission manager lists it.
export type ToolPermissionInfo = {
  // Key the decision is kept under.
  id: string;
  name: string;
  description: string;
  group: string;
  defaultPolicy: Exclude<PermissionPolicy, 'deny'>;
};
