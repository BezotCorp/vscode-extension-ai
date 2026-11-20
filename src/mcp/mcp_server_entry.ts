import type { McpToolInfo } from '.';
import type { McpClient } from './mcp_client';

export type McpServerEntry = {
  configKey: string;
  client: McpClient;
  tools: McpToolInfo[];
  lastUsed: number;
};
