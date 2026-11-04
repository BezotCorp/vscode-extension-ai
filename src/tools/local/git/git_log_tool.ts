import { ToolExecutionResult } from '../..';
import { readCount, readRepositoryPaths, readRevision } from './git_arguments';
import { GitPlan } from './git_plan';
import { FOLDER_PARAMETER, GitTool } from './git_tool';

export class GitLogTool extends GitTool {
  readonly id = 'git_log';
  readonly name = 'Git Log';
  readonly readOnlyCompatible = true;
  readonly permissionDefault = 'allow' as const;
  readonly description =
    'Lists recent commits (hash, author, date, subject), optionally for a revision or limited to some paths.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      maxCount: { type: 'number', description: 'Number of commits, 1 to 100 (default 20).' },
      revision: { type: 'string', description: 'Branch, tag or range to start from (default HEAD).' },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Only commits that touch these files or folders.',
      },
      folder: FOLDER_PARAMETER,
    },
  };

  protected async plan(input: unknown, repository: string): Promise<GitPlan | ToolExecutionResult> {
    const count = readCount(input, 'maxCount', 20, 100);
    const revision = readRevision(input, 'revision');
    const paths = readRepositoryPaths(input, 'paths', repository, false);

    for (const value of [count, revision, paths]) {
      if (value instanceof Error) {
        return this.reject(value.message);
      }
    }

    return {
      args: [
        'log',
        '--no-color',
        '--no-ext-diff',
        '-n',
        String(count),
        '--date=short',
        '--format=%h%x09%an%x09%ad%x09%s',
        ...(typeof revision === 'string' ? [revision] : []),
        '--',
        ...(paths as { pathspecs: string[] }).pathspecs,
      ],
      paths: (paths as { absolute: string[] }).absolute,
    };
  }
}
