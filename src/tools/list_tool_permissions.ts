import { McpManager } from '../mcp';
import { ToolPermissionInfo } from '../permissions';
import { createBuiltInTools } from './default_tools';
import { FileToolServices } from './local';
import { ToolAccessGuard } from './tool_access_guard';

// Every tool the AI could use, for the permission manager: the extension's own tools, then each MCP server's.
export async function listToolPermissions(
  accessGuard: ToolAccessGuard,
  mcpManager: McpManager,
  files: FileToolServices,
): Promise<ToolPermissionInfo[]> {
  const builtIn = createBuiltInTools(accessGuard, files).map((tool) => ({
    id: tool.permissionKey ?? tool.id,
    name: tool.id,
    description: tool.description,
    group: tool.id.startsWith('git_') ? 'Git' : tool.id === 'web_fetch' ? 'Network' : 'Files and workspace',
    defaultPolicy: tool.permissionDefault,
  }));
  const order = ['Files and workspace', 'Git', 'Network'];
  const mcp = (await mcpManager.describeTools()).map((tool) => ({
    id: tool.permissionKey,
    name: tool.name,
    description: tool.description,
    group: `MCP: ${tool.server}`,
    defaultPolicy: 'ask' as const,
  }));

  return [...builtIn.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group)), ...mcp];
}
