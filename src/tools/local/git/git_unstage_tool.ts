import { ToolExecutionResult } from '../..';
import { readRepositoryPaths } from './git_arguments';
import { GitPlan } from './git_plan';
import { FOLDER_PARAMETER, GitTool } from './git_tool';
import { t } from '../../../i18n';

export class GitUnstageTool extends GitTool {
  readonly id = 'git_unstage';
  readonly name = 'Git Unstage';
  readonly readOnlyCompatible = false;
  readonly permissionDefault = 'ask' as const;
  readonly description =
    'Removes files from the next commit without touching their content (git restore --staged). It never discards changes in the working tree.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      paths: { type: 'array', items: { type: 'string' }, description: 'Files or folders to unstage (1 to 50).' },
      folder: FOLDER_PARAMETER,
    },
    required: ['paths'],
  };

  protected async plan(input: unknown, repository: string): Promise<GitPlan | ToolExecutionResult> {
    const paths = readRepositoryPaths(input, 'paths', repository, true);

    if (paths instanceof Error) {
      return this.reject(paths.message);
    }

    return {
      args: ['restore', '--staged', '--', ...paths.pathspecs],
      action: `unstage ${paths.absolute.length} path(s) with git`,
      actionLabel: t('action.git.unstage', { count: paths.absolute.length }),
      detail: paths.absolute.join('\n'),
      paths: paths.absolute,
    };
  }
}
