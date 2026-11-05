import { PermissionError } from "../permissions";
import { Tool, ToolExecutionContext, ToolExecutionResult } from ".";
import { toolErrorFromException, toolFailure } from "./tool_result";

// What a tool that threw becomes for the model: a refusal, a cancellation or a technical failure, never an exception.
export function toolFailureFromException(
	tool: Tool,
	error: unknown,
	context?: ToolExecutionContext,
): ToolExecutionResult {
	if (error instanceof PermissionError) {
		const resource = error.resource;

		if (error.kind === "no_decision") {
			return toolFailure("cancelled", tool.id, resource, {
				reason: error.reason,
				message: error.message,
				executed: false,
				retryable: true,
			});
		}

		return toolFailure("denied", tool.id, resource, {
			reason: error.reason,
			message: error.message,
			executed: false,
			// Only a missing justification can be fixed by the model, by calling again with one.
			retryable: error.details?.correctableByTheModel === true,
			details: {
				decidedBy: error.kind === "user_refused" ? "user" : "policy",
				...error.details,
			},
		});
	}

	if (
		context?.signal?.aborted ||
		(error as { name?: string } | null)?.name === "AbortError"
	) {
		return toolFailure("cancelled", tool.id, undefined, {
			reason: "cancelled_by_user",
			message:
				"The operation was cancelled. If it had already started, it may have partially run.",
			executed: tool.readOnlyCompatible ? false : "unknown",
			retryable: false,
		});
	}

	return toolErrorFromException(
		tool.id,
		undefined,
		error,
		!tool.readOnlyCompatible,
	);
}
