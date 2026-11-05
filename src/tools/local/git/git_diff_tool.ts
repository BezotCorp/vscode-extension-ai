import type { ToolExecutionResult } from '../..';
import { readBoolean, readRepositoryPaths, readRevision } from './git_arguments';
import { FOLDER_PARAMETER } from './git_folder_parameter';
import type { GitPlan } from './git_plan';
import { GitTool } from './git_tool';

export class GitDiffTool extends GitTool {
	readonly id = 'git_diff';
	readonly name = 'Git Diff';
	readonly readOnlyCompatible = true;
	readonly permissionDefault = 'allow' as const;
	readonly description =
		'Shows changes as a diff: the working tree against the index (default), the staged changes (staged), or against a revision. Git output is not filtered by protectedPaths: if a sensitive file is versioned, it remains part of the repository state shown by Git.';
	readonly parameters = {
		type: 'object' as const,
		properties: {
			staged: {
				type: 'boolean',
				description: 'Show the staged changes instead of the unstaged ones.',
			},
			revision: {
				type: 'string',
				description: 'Revision or range to compare with, for example "HEAD~1" or "main..feature".',
			},
			paths: {
				type: 'array',
				items: { type: 'string' },
				description: 'Limit the diff to these files or folders.',
			},
			stat: {
				type: 'boolean',
				description: 'Only summarize the changes per file.',
			},
			folder: FOLDER_PARAMETER,
		},
	};

	protected async plan(input: unknown, repository: string): Promise<GitPlan | ToolExecutionResult> {
		const revision = readRevision(input, 'revision');
		const paths = await readRepositoryPaths(input, 'paths', repository, false);

		if (revision instanceof Error) {
			return this.reject(revision.message);
		}

		if (paths instanceof Error) {
			return this.reject(paths.message);
		}

		return {
			args: [
				'diff',
				'--no-color',
				'--no-ext-diff',
				'--no-textconv',
				...(readBoolean(input, 'stat') ? ['--stat'] : []),
				...(readBoolean(input, 'staged') ? ['--cached'] : []),
				...(revision ? [revision] : []),
				'--',
				...(paths.pathspecs.length > 0 ? paths.pathspecs : ['.']),
			],
			paths: paths.absolute,
		};
	}
}
