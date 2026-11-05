import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../..';
import { toolFailureFromException } from '../../tool_failure_from_exception';
import { MAX_SERIALIZED_CHARS, toolFailure, toolSuccess } from '../../tool_result';
import { validateToolInput } from '../../tool_validation';

const MAX_FILES_PER_CALL = 20;

// The plural form of a file tool: the same operation on several files in one call, so the AI picks the tool by the
// number of files and never has to decide anything else. It adds nothing of its own to what happens to a file:
// each item is handed to the singular tool, in order, which keeps its permission, its checks and its protections.
// The permission identity is the singular tool's. There is no global transaction: an item that fails does not stop the
// others, and the result lists the outcome of every item.
export abstract class BatchFileTool implements Tool {
	readonly readOnlyCompatible: boolean;
	readonly permissionDefault: 'allow' | 'ask';
	readonly editsFiles?: boolean;
	readonly requiresTrust?: boolean;
	readonly permissionKey: string;
	readonly parameters;

	protected constructor(
		private readonly single: Tool,
		readonly id: string,
		readonly name: string,
		readonly description: string,
	) {
		this.readOnlyCompatible = single.readOnlyCompatible;
		this.permissionDefault = single.permissionDefault;
		this.editsFiles = single.editsFiles;
		this.requiresTrust = single.requiresTrust;
		this.permissionKey = single.permissionKey ?? single.id;
		this.parameters = {
			type: 'object' as const,
			properties: {
				files: {
					type: 'array',
					description: `The files to process, one object per file, with the arguments of ${single.id}. At most ${MAX_FILES_PER_CALL}.`,
					items: {
						type: 'object',
						properties: single.parameters.properties,
						required: single.parameters.required,
					},
				},
			},
			required: ['files'],
		};
	}

	async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
		const items = parseItems((input as { files?: unknown } | null)?.files);

		if (items === undefined || items.length === 0 || items.length > MAX_FILES_PER_CALL) {
			return toolFailure('error', this.id, undefined, {
				reason: 'invalid_arguments',
				message: `Argument "files" must be a list of 1 to ${MAX_FILES_PER_CALL} objects, one per file. Nothing was executed.`,
				executed: false,
				retryable: true,
			});
		}

		// The results of all the files reach the model as one result: each item may take an equal share of what is left of
		// the limit once the wrapper around the list is counted, so the whole fits and nothing is cut after the tools have
		// remembered what they handed over.
		const share = this.shareOfLimit(items.length, context?.maxResultChars ?? MAX_SERIALIZED_CHARS);
		const results: ToolExecutionResult[] = [];

		for (const item of items) {
			results.push(await this.runOne(item, { ...context, maxResultChars: share }));
		}

		return this.aggregate(results);
	}

	// The longest the wrapper around the results can be for this many files, then an equal share of the rest.
	private shareOfLimit(count: number, limit: number): number {
		const wrapper = JSON.stringify({
			status: 'unknown',
			operation: this.id,
			executed: 'unknown',
			retryable: true,
			reason: 'partial_failure',
			message: `${count} of ${count} succeeded. Read "details.results": each file has its own outcome, in the order sent.`,
			details: { total: count, succeeded: count, failed: count, results: [] },
		});

		// One comma between two items.
		return Math.max(Math.floor((limit - wrapper.length - count) / count), 0);
	}

	private async runOne(item: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
		if (context.signal?.aborted) {
			return toolFailure('cancelled', this.single.id, undefined, {
				reason: 'cancelled_by_user',
				message: 'The request was cancelled before this file was processed. Nothing was executed for it.',
				executed: false,
				retryable: true,
			});
		}

		const problem = validateToolInput(this.single.parameters, item);

		if (problem) {
			return toolFailure('error', this.single.id, undefined, {
				reason: 'invalid_arguments',
				message: `Invalid arguments: ${problem}.`,
				executed: false,
				retryable: true,
			});
		}

		try {
			return await this.single.execute(item, context);
		} catch (error) {
			return toolFailureFromException(this.single, error, context);
		}
	}

	private aggregate(results: ToolExecutionResult[]): ToolExecutionResult {
		const succeeded = results.filter((result) => result.status === 'success').length;
		const failed = results.length - succeeded;
		const details = { total: results.length, succeeded, failed, results };

		if (failed === 0) {
			return toolSuccess(this.id, undefined, {
				message: `${succeeded} of ${results.length} succeeded.`,
				details,
			});
		}

		// One uncertain item makes the whole call uncertain: the loop must not repeat it before the state is inspected.
		const uncertain = results.some(
			(result) => result.status === 'unknown' || result.status === 'interrupted' || result.executed === 'unknown',
		);

		return {
			status: uncertain ? 'unknown' : 'error',
			operation: this.id,
			executed: uncertain ? 'unknown' : results.some((result) => result.executed === true),
			retryable: results.some((result) => result.status !== 'success' && result.retryable),
			reason: succeeded > 0 ? 'partial_failure' : 'all_failed',
			message: `${succeeded} of ${results.length} succeeded. Read "details.results": each file has its own outcome, in the order sent.`,
			details,
		};
	}
}

function parseItems(value: unknown): unknown[] | undefined {
	if (typeof value === 'string') {
		try {
			return parseItems(JSON.parse(value));
		} catch {
			return undefined;
		}
	}

	return Array.isArray(value) ? value : undefined;
}
