import type { ToolParametersSchema } from ".";

export type ToolDefinition = {
	name: string;
	description: string;
	parameters: ToolParametersSchema;
};
