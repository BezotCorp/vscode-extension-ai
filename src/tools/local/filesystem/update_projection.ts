import { buildDiffLines } from "./diff_builder";
import { sha256Hex } from "../../../workspace";
import { UpdateRequest } from "./update_request";
import { findUniqueMatch } from "./unique_match";
import { t } from "../../../i18n";

// The result of applying a request in memory, before anything touches the file: the exact bytes the file has to
// contain afterwards, the text for the permission dialog and, for a local edit, where the change applies.
export type UpdateProjection =
	| {
			ok: true;
			bytes: Uint8Array;
			sha: string;
			// The file as text (without a byte order mark) and the new content in the same form.
			before: string;
			after: string;
			// Local edit only: the unique place that was matched and the text that replaces it.
			anchor?: { offset: number; oldText: string; newText: string };
			detail: string;
	  }
	| {
			ok: false;
			reason: string;
			message: string;
			retryable: boolean;
			details?: Record<string, unknown>;
	  };

export function projectUpdate(
	current: Uint8Array,
	request: UpdateRequest,
): UpdateProjection {
	if (request.kind === "replace") {
		const bytes = new TextEncoder().encode(request.content);
		const before = decode(current, false) ?? "";

		if (sha256Hex(bytes) === sha256Hex(current)) {
			return {
				ok: false,
				reason: "no_change",
				message:
					"The file already contains exactly this content; nothing to change.",
				retryable: false,
			};
		}

		return {
			ok: true,
			bytes,
			sha: sha256Hex(bytes),
			before,
			after: request.content,
			detail: diffPreview(before, request.content),
		};
	}

	if (request.oldText === request.newText) {
		return {
			ok: false,
			reason: "no_change",
			message: "old_text and new_text are identical; nothing to change.",
			retryable: false,
		};
	}

	const text = decode(current, true);

	if (text === undefined) {
		return {
			ok: false,
			reason: "not_text",
			message:
				"The file is not valid UTF-8 text, so it cannot be edited this way. Nothing was changed.",
			retryable: false,
		};
	}

	// A byte order mark is kept as it is: it is taken off for matching and put back when the bytes are produced.
	const bom = text.startsWith("﻿") ? "﻿" : "";
	const before = bom ? text.slice(1) : text;
	const match = findUniqueMatch(before, request.oldText, request.newText);

	if (match.kind === "missing") {
		return {
			ok: false,
			reason: "old_text_not_found",
			message:
				"old_text was not found in the file. It must match exactly, including indentation and line breaks. Read the file again and copy the text as it is. Nothing was changed.",
			retryable: true,
		};
	}

	if (match.kind === "ambiguous") {
		return {
			ok: false,
			reason: "ambiguous_match",
			message: `old_text appears ${match.count} times. Include more surrounding lines so it matches exactly once. Nothing was changed.`,
			retryable: true,
			details: { occurrences: match.count },
		};
	}

	const after =
		before.slice(0, match.offset) +
		match.newText +
		before.slice(match.offset + match.oldText.length);
	const bytes = new TextEncoder().encode(bom + after);
	const line = before.slice(0, match.offset).split("\n").length;

	return {
		ok: true,
		bytes,
		sha: sha256Hex(bytes),
		before,
		after,
		anchor: {
			offset: match.offset,
			oldText: match.oldText,
			newText: match.newText,
		},
		detail: `${t("detail.line", { line })}\n${diffPreview(match.oldText, match.newText)}`,
	};
}

function decode(bytes: Uint8Array, fatal: boolean): string | undefined {
	try {
		return new TextDecoder("utf-8", { fatal, ignoreBOM: true }).decode(bytes);
	} catch {
		return undefined;
	}
}

// The lines that change: a full-file replacement must not fill the dialog with the lines it leaves alone.
function diffPreview(oldText: string, newText: string): string {
	return buildDiffLines(oldText, newText)
		.filter((line) => line.kind !== "unchanged")
		.map((line) => `${line.kind === "added" ? "+" : "-"} ${line.content}`)
		.join("\n");
}
