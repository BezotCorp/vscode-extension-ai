import type { ToolExecutionResult } from '../..';
import { readBoolean, readBranchName, readRemote } from './git_arguments';
import type { GitPlan } from './git_plan';
import { FOLDER_PARAMETER, GitTool } from './git_tool';
import { t } from '../../../i18n';

const NETWORK_TIMEOUT_MS = 120_000;

export class GitPushTool extends GitTool {
	readonly id = 'git_push';
	readonly name = 'Git Push';
	readonly readOnlyCompatible = false;
	readonly permissionDefault = 'ask' as const;
	readonly description =
		'Pushes a branch to a configured remote. There is no force option, no deletion and no tag push: git refuses a push that is not a fast-forward.';
	readonly parameters = {
		type: 'object' as const,
		properties: {
			remote: {
				type: 'string',
				description: 'Name of a configured remote (default origin).',
			},
			branch: {
				type: 'string',
				description: 'Branch to push (default: the current branch).',
			},
			setUpstream: {
				type: 'boolean',
				description: 'Make the remote branch the upstream of the local one.',
			},
			folder: FOLDER_PARAMETER,
		},
	};

	protected async plan(input: unknown): Promise<GitPlan | ToolExecutionResult> {
		const remote = readRemote(input, 'remote');
		const branch = readBranchName(input, 'branch');

		if (remote instanceof Error) {
			return this.reject(remote.message);
		}

		if (branch instanceof Error) {
			return this.reject(branch.message);
		}

		return {
			args: ['push', ...(readBoolean(input, 'setUpstream') ? ['--set-upstream'] : []), remote, branch ?? 'HEAD'],
			action: `push ${branch ?? 'the current branch'} to the git remote ${remote}`,
			actionLabel: t('action.git.push', {
				branch: branch ?? t('action.git.currentBranch'),
				remote,
			}),
			timeoutMs: NETWORK_TIMEOUT_MS,
		};
	}
}
