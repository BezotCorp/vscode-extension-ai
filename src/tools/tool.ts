import type { ToolAccessProfile } from "../permissions";
import type {
	ToolExecutionContext,
	ToolExecutionResult,
	ToolParametersSchema,
} from ".";

export interface Tool extends ToolAccessProfile {
	description: string;
	parameters: ToolParametersSchema;
	execute(
		input: unknown,
		context?: ToolExecutionContext,
	): Promise<ToolExecutionResult>;
}
