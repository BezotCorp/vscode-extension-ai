import type { ToolStatus } from "./tool_status";

export type ToolExecutionResult = {
	status: ToolStatus;
	operation: string;
	resource?: string;
	// Whether the operation was started. "unknown" when even that cannot be told.
	executed: boolean | "unknown";
	retryable: boolean;
	reason?: string;
	message?: string;
	content?: string;
	details?: Record<string, unknown>;
};
