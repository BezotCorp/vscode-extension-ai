export type McpContentPart = {
	type: string;
	text?: string;
	mimeType?: string;
	data?: string;
	resource?: { uri?: string; text?: string; mimeType?: string };
};
