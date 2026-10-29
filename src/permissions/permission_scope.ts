export type PermissionScopeKind = 'file' | 'folder' | 'workspace' | 'command' | 'domain' | 'mcpServer' | 'mcpTool';

export type PermissionScope = {
  kind: PermissionScopeKind;
  value: string;
};
