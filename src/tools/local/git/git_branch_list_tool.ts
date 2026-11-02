import { ToolExecutionResult } from '../..';
import { GitPlan } from './git_plan';
import { FOLDER_PARAMETER, GitTool } from './git_tool';

export class GitBranchListTool extends GitTool {
  readonly id = 'git_branch_list';
  readonly name = 'Git Branch List';
  readonly readOnlyCompatible = true;
  readonly permissionDefault = 'allow' as const;
  readonly description = 'Lists local and remote-tracking branches with their last commit and upstream (git branch --all).';
  readonly parameters = { type: 'object' as const, properties: { folder: FOLDER_PARAMETER } };

  protected async plan(): Promise<GitPlan | ToolExecutionResult> {
    return { args: ['branch', '--list', '--all', '--verbose', '--no-color'] };
  }
}
