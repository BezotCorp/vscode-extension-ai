import type { McpClient } from './mcp_client';
import type { McpToolInfo } from '.';

export type McpServerEntry = {
	configKey: string;
	client: McpClient;
	tools: McpToolInfo[];
	lastUsed: number;
};
