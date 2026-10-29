export type PermissionCapability =
  | 'read'
  | 'search'
  | 'create'
  | 'write'
  | 'delete'
  | 'move'
  | 'execute'
  | 'network'
  | 'mcp';

export const READ_ONLY_CAPABILITIES: readonly PermissionCapability[] = ['read', 'search'];
