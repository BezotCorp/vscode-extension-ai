import { isMessageKey, t } from '../i18n';
import type { McpManager } from '../mcp';
import type { ToolPermissionInfo } from '../permissions';
import { createBuiltInTools } from './default_tools';
import type { FileToolServices } from './local';
import type { ToolAccessGuard } from './tool_access_guard';

// Every tool the AI could use, for the permission manager: the extension's own tools, then each MCP server's.
export async function listToolPermissions(
	accessGuard: ToolAccessGuard,
	mcpManager: McpManager,
	files: FileToolServices,
): Promise<ToolPermissionInfo[]> {
	// A plural file tool shares the permission of its singular tool: it is listed once, under the singular.
	const builtIn = createBuiltInTools(accessGuard, files)
		.filter((tool) => tool.permissionKey === undefined || tool.permissionKey === tool.id)
		.map((tool) => ({
			id: tool.permissionKey ?? tool.id,
			name: tool.id,
			// The summary is shown to the user in their language; the tool's own description is written for the model.
			description: summarize(tool.id, tool.description),
			group: tool.id.startsWith('git_')
				? t('group.git')
				: tool.id === 'web_fetch'
					? t('group.network')
					: t('group.files'),
			defaultPolicy: tool.permissionDefault,
		}));
	const order = [t('group.files'), t('group.git'), t('group.network')];
	const mcp = (await mcpManager.describeTools()).map((tool) => ({
		id: tool.permissionKey,
		name: tool.name,
		description: tool.description,
		group: t('group.mcp', { server: tool.server }),
		defaultPolicy: 'ask' as const,
	}));

	return [...builtIn.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group)), ...mcp];
}

function summarize(toolId: string, fallback: string): string {
	const key = `toolSummary.${toolId}`;

	return isMessageKey(key) ? t(key) : fallback;
}
