import { t } from '../../../i18n';
import type { ToolExecutionResult } from '../..';
import { readRemote } from './git_arguments';
import { FOLDER_PARAMETER } from './git_folder_parameter';
import type { GitPlan } from './git_plan';
import { NETWORK_TIMEOUT_MS } from './git_timeouts';
import { GitTool } from './git_tool';

export class GitFetchTool extends GitTool {
  readonly id = 'git_fetch';
  readonly name = 'Git Fetch';
  readonly readOnlyCompatible = false;
  readonly permissionDefault = 'ask' as const;
  readonly description =
    'Downloads new commits and branches from a configured remote without changing the working tree (git fetch --prune).';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      remote: {
        type: 'string',
        description: 'Name of a configured remote (default origin).',
      },
      folder: FOLDER_PARAMETER,
    },
  };

  protected async plan(input: unknown): Promise<GitPlan | ToolExecutionResult> {
    const remote = readRemote(input, 'remote');

    return remote instanceof Error
      ? this.reject(remote.message)
      : {
          args: ['fetch', '--prune', remote],
          action: `fetch from the git remote ${remote}`,
          actionLabel: t('action.git.fetch', { remote }),
          timeoutMs: NETWORK_TIMEOUT_MS,
        };
  }
}
