import type { ToolExecutionResult, ToolStatus } from '.';
import type { FailureFields } from './failure_fields';
import type { SuccessFields } from './success_fields';
import { CUT_MARKER, MAX_SERIALIZED_CHARS } from './tool_result_constants';
import { ERROR_CODES } from './tool_error_codes';

export function toolSuccess(
	operation: string,
	resource: string | undefined,
	fields: SuccessFields = {},
): ToolExecutionResult {
	return {
		status: 'success',
		operation,
		resource,
		executed: true,
		retryable: false,
		...fields,
	};
}

export function toolFailure(
	status: Exclude<ToolStatus, 'success'>,
	operation: string,
	resource: string | undefined,
	fields: FailureFields,
): ToolExecutionResult {
	return { status, operation, resource, ...fields };
}

// `sideEffects` tells whether the failed operation could have changed something before failing.
export function toolErrorFromException(
	operation: string,
	resource: string | undefined,
	error: unknown,
	sideEffects: boolean,
): ToolExecutionResult {
	const code = (error as { code?: unknown } | null)?.code;
	const known = typeof code === 'string' ? ERROR_CODES[code] : undefined;
	const detail = error instanceof Error ? error.message : String(error);

	if (known) {
		return toolFailure('error', operation, resource, {
			reason: known.reason,
			message: `${known.message} (${detail})`,
			executed: false,
			retryable: false,
			details: { code },
		});
	}

	return toolFailure('error', operation, resource, {
		reason: 'exception',
		message: detail,
		executed: sideEffects ? 'unknown' : false,
		retryable: false,
	});
}

// The result as the model will receive it. When the serialized result is too long, only its content is cut, and cut so
// that the serialization fits `maxChars` exactly (the marker and the flag that tell about the cut are counted).
// `kept` is how many characters of the original content remain in the result. A tool that remembers what the model
// received calls this itself, before remembering, so that what it keeps is what the model gets; serializing the
// result later cuts nothing more.
export function fitToolResult(
	result: ToolExecutionResult,
	maxChars = MAX_SERIALIZED_CHARS,
): { result: ToolExecutionResult; kept: number } {
	const whole = result.content?.length ?? 0;

	if (JSON.stringify(result).length <= maxChars || !result.content) {
		return { result, kept: whole };
	}

	const cutWith = (kept: number): ToolExecutionResult => ({
		...result,
		content: `${result.content?.slice(0, kept)}${CUT_MARKER}`,
		details: { ...result.details, contentCutForContext: true },
	});
	// Each character removed from the content removes at least one character from the serialization.
	const overflow = JSON.stringify(cutWith(whole)).length - maxChars;
	const kept = Math.max(whole - overflow, 0);

	return { result: cutWith(kept), kept };
}

// What the model receives: one compact JSON object, only the fields that carry information.
export function serializeToolResult(result: ToolExecutionResult, maxChars = MAX_SERIALIZED_CHARS): string {
	return JSON.stringify(fitToolResult(result, maxChars).result);
}
