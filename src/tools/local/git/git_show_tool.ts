import { protectedPathspecs } from '../../../permissions';
import type { ToolExecutionResult } from '../..';
import { readRepositoryPaths, readRevision } from './git_arguments';
import { FOLDER_PARAMETER } from './git_folder_parameter';
import type { GitPlan } from './git_plan';
import { GitTool } from './git_tool';

export class GitShowTool extends GitTool {
	readonly id = 'git_show';
	readonly name = 'Git Show';
	readonly readOnlyCompatible = true;
	readonly permissionDefault = 'allow' as const;
	readonly description =
		'Shows one commit: message, changed files and diff. Protected files such as .env are left out of the diff.';
	readonly parameters = {
		type: 'object' as const,
		properties: {
			revision: {
				type: 'string',
				description: 'Commit, tag or branch, for example "HEAD" or "a1b2c3d".',
			},
			paths: {
				type: 'array',
				items: { type: 'string' },
				description: 'Limit the diff to these files or folders.',
			},
			folder: FOLDER_PARAMETER,
		},
		required: ['revision'],
	};

	protected async plan(input: unknown, repository: string): Promise<GitPlan | ToolExecutionResult> {
		const revision = readRevision(input, 'revision');
		const paths = await readRepositoryPaths(input, 'paths', repository, false);

		if (!revision || revision instanceof Error) {
			return this.reject(revision instanceof Error ? revision.message : '"revision" is required.');
		}

		if (paths instanceof Error) {
			return this.reject(paths.message);
		}

		return {
			args: [
				'show',
				'--no-color',
				'--no-ext-diff',
				'--no-textconv',
				'--stat',
				'--patch',
				revision,
				'--',
				...(paths.pathspecs.length > 0 ? paths.pathspecs : ['.']),
				...protectedPathspecs(),
			],
			paths: paths.absolute,
		};
	}
}
