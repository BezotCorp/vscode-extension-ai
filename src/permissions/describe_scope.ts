import { PermissionScope } from '.';

const LABELS: Record<PermissionScope['kind'], string> = {
  file: 'file',
  folder: 'folder',
  workspace: 'workspace',
  command: 'command',
  domain: 'domain',
  mcpServer: 'MCP server',
  mcpTool: 'MCP tool',
};

export function describeScope(scope: PermissionScope): string {
  return `${LABELS[scope.kind]} ${sanitizeForPrompt(scope.value)}`;
}

// Model-provided text is shown in trusted dialogs: strip anything that could fake extra lines or controls.
export function sanitizeForPrompt(text: string, maxLength = 300): string {
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]+/g, ' ').trim();

  return clean.length > maxLength ? `${clean.slice(0, maxLength)}…` : clean;
}
