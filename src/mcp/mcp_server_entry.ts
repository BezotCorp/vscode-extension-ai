import { McpClient } from './mcp_client';
import { McpToolInfo } from '.';

export type McpServerEntry = {
  configKey: string;
  client: McpClient;
  tools: McpToolInfo[];
  lastUsed: number;
};
