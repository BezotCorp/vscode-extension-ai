import { t } from '../../../i18n';
import type { ToolExecutionResult } from '../..';
import { readBranchName, readRevision } from './git_arguments';
import { FOLDER_PARAMETER } from './git_folder_parameter';
import type { GitPlan } from './git_plan';
import { GitTool } from './git_tool';

export class GitBranchCreateTool extends GitTool {
	readonly id = 'git_branch_create';
	readonly name = 'Git Branch Create';
	readonly readOnlyCompatible = false;
	readonly permissionDefault = 'ask' as const;
	readonly description =
		'Creates a branch, from HEAD or from a given revision, without switching to it (use git_switch).';
	readonly parameters = {
		type: 'object' as const,
		properties: {
			name: { type: 'string', description: 'New branch name.' },
			startPoint: {
				type: 'string',
				description: 'Revision to start from (default HEAD).',
			},
			folder: FOLDER_PARAMETER,
		},
		required: ['name'],
	};

	protected async plan(input: unknown): Promise<GitPlan | ToolExecutionResult> {
		const name = readBranchName(input, 'name');
		const start = readRevision(input, 'startPoint');

		if (!name || name instanceof Error) {
			return this.reject(name instanceof Error ? name.message : '"name" is required.');
		}

		if (start instanceof Error) {
			return this.reject(start.message);
		}

		return {
			args: ['branch', name, ...(start ? [start] : [])],
			action: `create the git branch ${name}`,
			actionLabel: t('action.git.branchCreate', { branch: name }),
		};
	}
}
