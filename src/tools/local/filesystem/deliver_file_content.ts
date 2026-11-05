import {
	TRUNCATION_MARKER,
	type TruncatedText,
	truncateText,
} from "../../../workspace";
import type { ToolExecutionResult } from "../..";
import { fitToolResult } from "../../tool_result";

export type DeliveredContent = {
	// The result exactly as the model will receive it.
	result: ToolExecutionResult;
	// The part of `text` that is really in that result: no truncation marker, and no line that was cut in the middle.
	received: string;
};

// Gives file content to the model through every limit that applies to it (the size of a file, then the size of the
// whole result) and tells what really got through. What the tracker remembers is `received`, computed after the
// last cut, so it is never more than what the model holds. Serializing the result later cuts nothing more.
export function deliverFileContent(
	text: string,
	build: (shown: TruncatedText) => ToolExecutionResult,
	maxResultChars?: number,
): DeliveredContent {
	const shown = truncateText(text);
	const fitted = fitToolResult(build(shown), maxResultChars);
	const whole = shown.text.length;
	const cut = shown.truncated || fitted.kept < whole;

	if (!cut) {
		return { result: fitted.result, received: text };
	}

	const bodyLength = shown.truncated ? whole - TRUNCATION_MARKER.length : whole;
	const body = shown.text.slice(0, Math.min(fitted.kept, bodyLength));
	const lastBreak = body.lastIndexOf("\n");

	return {
		result: fitted.result,
		received: lastBreak < 0 ? "" : body.slice(0, lastBreak),
	};
}
