// An MCP tool as the permission manager lists it.
export type McpToolDescriptor = {
	// Key the permission is kept under: mcp__<server>__<tool>.
	permissionKey: string;
	server: string;
	name: string;
	description: string;
};
