import { t } from '../../../i18n';
import type { ToolExecutionResult } from '../..';
import { readBranchName } from './git_arguments';
import { FOLDER_PARAMETER } from './git_folder_parameter';
import type { GitPlan } from './git_plan';
import { GitTool } from './git_tool';

export class GitSwitchTool extends GitTool {
	readonly id = 'git_switch';
	readonly name = 'Git Switch';
	readonly readOnlyCompatible = false;
	readonly permissionDefault = 'ask' as const;
	readonly description =
		'Switches to an existing branch (git switch). It never discards local changes: git refuses when they would be overwritten.';
	readonly parameters = {
		type: 'object' as const,
		properties: {
			branch: { type: 'string', description: 'Existing branch to switch to.' },
			folder: FOLDER_PARAMETER,
		},
		required: ['branch'],
	};

	protected async plan(input: unknown): Promise<GitPlan | ToolExecutionResult> {
		const branch = readBranchName(input, 'branch');

		if (!branch || branch instanceof Error) {
			return this.reject(branch instanceof Error ? branch.message : '"branch" is required.');
		}

		return {
			args: ['switch', branch],
			action: `switch to the git branch ${branch}`,
			actionLabel: t('action.git.switch', { branch }),
		};
	}
}
