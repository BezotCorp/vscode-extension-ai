import { t } from '../../../i18n';
import type { ToolExecutionResult } from '../..';
import { readMessage } from './git_arguments';
import { FOLDER_PARAMETER } from './git_folder_parameter';
import type { GitPlan } from './git_plan';
import { GitTool } from './git_tool';

export class GitCommitTool extends GitTool {
	readonly id = 'git_commit';
	readonly name = 'Git Commit';
	readonly readOnlyCompatible = false;
	readonly permissionDefault = 'ask' as const;
	readonly description =
		'Commits what is staged with the given message. It cannot amend, sign off, skip the repository hooks or stage files itself: use git_add first. The repository hooks run.';
	readonly parameters = {
		type: 'object' as const,
		properties: {
			message: {
				type: 'string',
				description: 'Commit message (up to 4000 characters).',
			},
			folder: FOLDER_PARAMETER,
		},
		required: ['message'],
	};

	protected async plan(
		input: unknown,
		repository: string,
		signal?: AbortSignal,
	): Promise<GitPlan | ToolExecutionResult> {
		const message = readMessage(input, 'message');

		if (message instanceof Error) {
			return this.reject(message.message);
		}

		const staged = await this.capture(['diff', '--cached', '--stat', '--no-ext-diff'], repository, signal);

		if (staged === '') {
			return this.reject('Nothing is staged, so there is nothing to commit. Stage files with git_add first.');
		}

		return {
			args: ['commit', '-m', message],
			action: 'create a git commit',
			actionLabel: t('action.git.commit'),
			detail: t('detail.commit', {
				message,
				staged: staged ?? t('detail.stagedUnknown'),
			}),
		};
	}
}
