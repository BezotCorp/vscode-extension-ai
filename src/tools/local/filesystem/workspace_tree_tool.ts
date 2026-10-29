import { Tool, ToolExecutionResult } from '../..';
import { toolSuccess } from '../../tool_result';

export class WorkspaceTreeTool implements Tool {
  readonly id = 'workspaceTree';
  readonly name = 'Workspace Tree';
  readonly readOnlyCompatible = true;
  readonly description = 'Provides a bounded list of workspace files.';
  readonly parameters = { type: 'object' as const, properties: {} };

  constructor(private readonly getWorkspaceFiles: () => Promise<string[]>) {}

  async execute(): Promise<ToolExecutionResult> {
    const files = await this.getWorkspaceFiles();

    return toolSuccess(this.id, 'workspace', {
      content: files.map((file) => `- ${file}`).join('\n'),
      details: { files: files.length },
    });
  }
}
