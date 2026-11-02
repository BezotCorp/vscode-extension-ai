import { ToolExecutionResult } from '../..';
import { readRepositoryPaths } from './git_arguments';
import { GitPlan } from './git_plan';
import { FOLDER_PARAMETER, GitTool } from './git_tool';

export class GitAddTool extends GitTool {
  readonly id = 'git_add';
  readonly name = 'Git Add';
  readonly readOnlyCompatible = false;
  readonly permissionDefault = 'ask' as const;
  readonly description = 'Stages files or folders for the next commit (git add). Paths are required; there is no "add everything".';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      paths: { type: 'array', items: { type: 'string' }, description: 'Files or folders to stage (1 to 50).' },
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
      args: ['add', '--', ...paths.pathspecs],
      action: `stage ${paths.absolute.length} path(s) with git`,
      detail: paths.absolute.join('\n'),
      paths: paths.absolute,
    };
  }
}
