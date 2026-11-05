import * as vscode from "vscode";

import { contentEffect, PermissionError } from "../../../permissions";
import {
	findDirtyDocuments,
	type ResolvedPath,
	resolvePath,
	resourcePath,
	type TruncatedText,
} from "../../../workspace";
import type {
	Tool,
	ToolAccessGuard,
	ToolExecutionContext,
	ToolExecutionResult,
} from "../..";
import {
	ACCESS_PARAMETER,
	readAccessArg,
	readStringArg,
} from "../../tool_input";
import {
	toolErrorFromException,
	toolFailure,
	toolSuccess,
} from "../../tool_result";
import type { FileRead } from "./file_read";
import { deliverFileContent } from "./deliver_file_content";
import type { FileVersionTracker, ReceivedPart } from "./file_version_tracker";
import { READ_MODE_COMPOSED } from "./read_mode";
import type { ReadFileTool } from "./read_file_tool";
import { unsavedChangesFailure } from "./unsaved_changes_failure";
import { type UpdateProjection, projectUpdate } from "./update_projection";
import type { UpdateRequest } from "./update_request";
import type { WriteFileData } from "./write_file_data";
import type { WriteFilePipeline } from "./write_file_pipeline";
import type { WriteFileState } from "./write_file_state";
import { t } from "../../../i18n";

// Retries allowed after the first attempt when the file keeps changing: the initial attempt and two retries.
const MAX_RETRY = 2;

type Prepared = {
	read: FileRead;
	projection: Extract<UpdateProjection, { ok: true }>;
	contextWasCurrent: boolean;
	// Local change on a file that changed: the part the model received that is still unchanged around the change.
	part?: ReceivedPart;
};

// The only operation that changes an existing file. The AI gives either a local change (old_text, new_text) or a
// whole new content; both become the same thing, the exact bytes the file must contain afterwards. From there one
// chain applies: the context the AI worked from is checked against the file, the permission system gets the diff,
// everything is checked again after the dialog, then the persistent pipeline makes a safety copy, writes, checks the
// integrity of what was written and restores the original if it is wrong. None of that is visible to the AI.
export class UpdateFileTool implements Tool {
	readonly id = "update_file";
	readonly name = "Update File";
	readonly readOnlyCompatible = false;
	readonly permissionDefault = "ask" as const;
	readonly editsFiles = true;
	readonly description =
		"Changes an existing file. Either give old_text and new_text to replace one exact piece of text (old_text must match the file exactly, whitespace included, and appear once: include enough surrounding lines to make it unique; an empty new_text deletes it), or give content to replace the whole file. Prefer old_text/new_text for any change smaller than the whole file. Read the file with read_file first: if what you read is no longer what the file contains where you change it, nothing is written and you receive its current content, from which you must redo your change. Use create_file for a new file. Refused when the file has unsaved changes in the editor.";
	readonly parameters = {
		type: "object" as const,
		properties: {
			path: {
				type: "string",
				description: "File path, relative to the workspace root or absolute.",
			},
			old_text: {
				type: "string",
				description:
					"Exact text to replace. Must appear exactly once in the file.",
			},
			new_text: {
				type: "string",
				description: "Replacement text. An empty string deletes old_text.",
			},
			content: {
				type: "string",
				description:
					"New full content of the file. Use instead of old_text/new_text.",
			},
			access: ACCESS_PARAMETER,
		},
		required: ["path"],
	};

	constructor(
		private readonly accessGuard: ToolAccessGuard,
		private readonly reader: ReadFileTool,
		private readonly versions: FileVersionTracker,
		private readonly pipeline: WriteFilePipeline,
	) {}

	async execute(
		input: unknown,
		context?: ToolExecutionContext,
	): Promise<ToolExecutionResult> {
		const request = this.parseRequest(input);

		if ("error" in request) {
			return this.invalidArguments(request.error);
		}

		const resolved = await resolvePath(readStringArg(input, "path") ?? "");
		const fsPath = resourcePath(resolved.uri);

		if (findDirtyDocuments(resolved.uri).length > 0) {
			return unsavedChangesFailure(this.id, fsPath);
		}

		// A conflict hands the current content back to the AI, which is a way of reading the file.
		await this.accessGuard.assertReadable(this, resolved, false, {
			signal: context?.signal,
		});

		try {
			const stat = await vscode.workspace.fs.stat(resolved.uri);

			if (stat.type & vscode.FileType.Directory) {
				return toolFailure("error", this.id, fsPath, {
					reason: "is_a_directory",
					message: "The path is a directory; nothing was changed.",
					executed: false,
					retryable: false,
				});
			}

			const first = await this.prepare(
				resolved,
				request,
				context?.maxResultChars,
			);

			if ("status" in first) {
				return first;
			}

			await this.accessGuard.assertPath(this, "write", resolved, false, {
				detail: first.projection.detail,
				effects: [contentEffect(fsPath)],
				access: readAccessArg(input),
				signal: context?.signal,
			});

			// The dialog can stay open for a long time: what the user approved must still be exactly what is going to be
			// written, on a file that is still in the state the AI worked from.
			if (findDirtyDocuments(resolved.uri).length > 0) {
				return unsavedChangesFailure(this.id, fsPath);
			}

			const second = await this.prepare(
				resolved,
				request,
				context?.maxResultChars,
			);

			if ("status" in second) {
				return second;
			}

			if (
				second.read.sha !== first.read.sha ||
				second.projection.sha !== first.projection.sha
			) {
				return this.conflict(
					fsPath,
					second.read,
					request,
					true,
					context?.maxResultChars,
				);
			}

			const record = await this.pipeline.run(
				resolved.uri,
				second.projection.bytes,
				second.read.sha,
			);
			const data = record.data as WriteFileData;

			switch (record.state) {
				case "integrity_true":
					this.rememberWritten(fsPath, request, second, data.expectedSha);
					this.versions.clearConflicts(fsPath);

					return toolSuccess(this.id, fsPath, {
						message:
							"File replaced on disk and checked: it contains exactly the intended content.",
						details: {
							via: "disk",
							bytesWritten: second.projection.bytes.length,
							verified: true,
						},
					});
				case "copy_conflict":
				case "update_conflict":
					return this.conflictFromPipeline(
						resolved,
						request,
						record.state,
						context?.maxResultChars,
					);
				case "copy_failed":
					return toolFailure("error", this.id, fsPath, {
						reason: "backup_failed",
						message:
							"The safety copy of the file could not be made, so nothing was written. The file is unchanged.",
						executed: false,
						retryable: true,
					});
				case "update_failed":
					return toolFailure("error", this.id, fsPath, {
						reason: "write_not_attempted",
						message: `The file could not be written (${data.reason ?? "unknown reason"}). It was not changed.`,
						executed: false,
						retryable: true,
					});
				case "restore_done":
					return toolFailure("error", this.id, fsPath, {
						reason:
							data.reason === "write_error"
								? "write_failed"
								: "integrity_check_failed",
						message:
							data.reason === "write_error"
								? `The write failed (${data.error ?? "unknown error"}) and the original was restored from the safety copy and checked. The file is as it was before.`
								: "After writing, the file did not contain exactly the intended content, so the original was restored. The file is as it was before.",
						executed: true,
						retryable: true,
					});
				default:
					void vscode.window.showErrorMessage(
						t("notify.writeNotRestored", {
							path: fsPath,
							backup: data.backupPath,
						}),
					);

					return toolFailure("error", this.id, fsPath, {
						reason: "restore_failed",
						message:
							"After writing, the file did not contain the intended content and the original could not be restored. The user has been told where the safety copy is. Do not write to this file again.",
						executed: true,
						retryable: false,
					});
			}
		} catch (error) {
			if (error instanceof PermissionError) {
				throw error;
			}

			return toolErrorFromException(this.id, fsPath, error, true);
		}
	}

	// Exactly one of the two forms: a local change (old_text with new_text) or a whole content.
	private parseRequest(input: unknown): UpdateRequest | { error: string } {
		const values = (input ?? {}) as {
			old_text?: unknown;
			new_text?: unknown;
			content?: unknown;
		};
		const hasEdit =
			values.old_text !== undefined || values.new_text !== undefined;
		const hasContent = values.content !== undefined;

		if (hasEdit === hasContent) {
			return {
				error:
					"Give either old_text with new_text (a local change) or content (the whole file), not both and not neither.",
			};
		}

		if (hasContent) {
			return typeof values.content === "string"
				? { kind: "replace", content: values.content }
				: { error: 'Argument "content" must be a string.' };
		}

		if (typeof values.old_text !== "string" || values.old_text === "") {
			return { error: 'Argument "old_text" must be a non-empty string.' };
		}

		if (typeof values.new_text !== "string") {
			return {
				error:
					'Argument "new_text" must be a string (use an empty string to delete).',
			};
		}

		return { kind: "edit", oldText: values.old_text, newText: values.new_text };
	}

	// Reads the file as it is on the filesystem now, projects the final bytes in memory and checks that the context the
	// AI worked from still holds. Returns a result to hand back to the AI when the update cannot go on.
	private async prepare(
		resolved: ResolvedPath,
		request: UpdateRequest,
		maxResultChars?: number,
	): Promise<Prepared | ToolExecutionResult> {
		const fsPath = resolved.uri.fsPath;
		const read = await this.reader.read(resolved, READ_MODE_COMPOSED);

		if (read.binary) {
			return toolFailure("error", this.id, fsPath, {
				reason: "binary_file",
				message:
					"The file looks binary and cannot be updated as text. Nothing was changed.",
				executed: false,
				retryable: false,
			});
		}

		const projection = projectUpdate(read.bytes, request);
		const current = this.versions.isCurrent(fsPath, read.sha);

		if (!projection.ok) {
			// A text that cannot be found is first a sign that the AI works from an outdated file.
			if (
				(projection.reason === "old_text_not_found" ||
					projection.reason === "ambiguous_match") &&
				!current
			) {
				return this.conflict(
					fsPath,
					read,
					request,
					this.versions.hasSeen(fsPath),
					maxResultChars,
				);
			}

			return toolFailure("error", this.id, fsPath, {
				reason: projection.reason,
				message: projection.message,
				executed: false,
				retryable: projection.retryable,
				details: projection.details,
			});
		}

		// A whole replacement depends on the whole file. A local change depends on the part the AI received around it.
		const part =
			projection.anchor === undefined
				? undefined
				: this.versions.receivedPart(
						fsPath,
						projection.before,
						projection.anchor.offset,
						projection.anchor.oldText.length,
					);

		if (!current && part === undefined) {
			return this.conflict(
				fsPath,
				read,
				request,
				this.versions.hasSeen(fsPath),
				maxResultChars,
			);
		}

		return { read, projection, contextWasCurrent: current, part };
	}

	// After a write that was checked: what the AI knows of the file now. If its whole context was valid, it knows the
	// whole new file; otherwise the part it worked from, with its own change in it.
	private rememberWritten(
		fsPath: string,
		request: UpdateRequest,
		prepared: Prepared,
		sha: string,
	): void {
		const { projection } = prepared;

		if (
			request.kind === "replace" ||
			prepared.contextWasCurrent ||
			projection.anchor === undefined ||
			prepared.part === undefined
		) {
			this.versions.remember(fsPath, sha, projection.after, true);
			return;
		}

		const { oldText, newText, offset } = projection.anchor;
		const { text, start } = prepared.part;
		const at = offset - start;

		this.versions.remember(
			fsPath,
			sha,
			text.slice(0, at) + newText + text.slice(at + oldText.length),
			false,
		);
	}

	// The file changed after the pipeline had started but before anything was written: same handling as any conflict.
	private async conflictFromPipeline(
		resolved: ResolvedPath,
		request: UpdateRequest,
		pipelineState: WriteFileState,
		maxResultChars?: number,
	): Promise<ToolExecutionResult> {
		const read = await this.reader.read(resolved, READ_MODE_COMPOSED);

		return this.conflict(
			resolved.uri.fsPath,
			read,
			request,
			true,
			maxResultChars,
			pipelineState,
		);
	}

	// Nothing is written. The AI gets the fresh content and starts again from it, up to MAX_RETRY retries.
	private conflict(
		fsPath: string,
		read: FileRead,
		request: UpdateRequest,
		known: boolean,
		maxResultChars?: number,
		pipelineState?: WriteFileState,
	): ToolExecutionResult {
		const conflicts = this.versions.recordConflict(fsPath);
		// Same version of the file, but the AI only received part of it: a whole replacement cannot rest on that.
		const partial =
			known &&
			request.kind === "replace" &&
			this.versions.isSameVersion(fsPath, read.sha);
		const stopped = conflicts > MAX_RETRY;

		if (stopped) {
			this.versions.clearConflicts(fsPath);
			void vscode.window.showWarningMessage(
				t("notify.updateStopped", { path: fsPath }),
			);
		}

		const build = (shown?: TruncatedText): ToolExecutionResult =>
			stopped
				? toolFailure("error", this.id, fsPath, {
						reason: "concurrent_modifications",
						message:
							"update_file was stopped for good: the file kept changing after the retries allowed. Nothing was written and the user has already been told, so do not explain it at length. Do not repeat the earlier attempt as it was: decide what to do from the current content of the file.",
						executed: false,
						retryable: false,
						details: {
							event: "update_file_stopped",
							cause: "repeated_concurrent_modifications",
							retriesAllowed: MAX_RETRY,
							finalState: "no_change_applied",
							persistentPipelineStarted: pipelineState !== undefined,
							...(pipelineState && { pipelineState }),
							userInformedAutomatically: true,
							currentContentIncluded: shown !== undefined,
							doNotRepeatPreviousAttemptBlindly: true,
							decideFromCurrentState: true,
						},
						content: shown?.text,
					})
				: toolFailure("error", this.id, fsPath, {
						reason: "file_changed",
						message: !known
							? "You had not read the current version of this file. Nothing was written. Its current content is below: redo your change from this version and call update_file again."
							: partial
								? "Your context does not cover the whole file as it is now, and a whole replacement needs all of it. Nothing was written. Its current content is below: redo your change from it and call update_file again, with old_text and new_text if the change is local."
								: "What you read is no longer what the file contains around your change. Nothing was written. Its current content is below: redo your change from this version and call update_file again.",
						executed: false,
						retryable: true,
						details: {
							retriesLeft: MAX_RETRY - (conflicts - 1),
							binary: read.binary,
							contentTruncated: shown?.truncated ?? false,
						},
						content: shown?.text,
					});

		if (read.binary) {
			return build();
		}

		// From here the AI holds this version, but only what really reaches it: that is what the next attempt is compared with.
		const delivered = deliverFileContent(read.text, build, maxResultChars);

		this.versions.remember(
			fsPath,
			read.sha,
			delivered.received,
			delivered.received === read.text,
		);

		return delivered.result;
	}

	private invalidArguments(message: string): ToolExecutionResult {
		return toolFailure("error", this.id, undefined, {
			reason: "invalid_arguments",
			message,
			executed: false,
			retryable: true,
		});
	}
}
