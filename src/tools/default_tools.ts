import { getSelectedText, getWorkspaceFiles } from '../context';
import {
  CreateFileTool,
  DeleteFileTool,
  EditFileTool,
  FileToolServices,
  GitAddTool,
  GitBranchCreateTool,
  GitBranchListTool,
  GitCommitTool,
  GitDiffTool,
  GitFetchTool,
  GitLogTool,
  GitPullTool,
  GitPushTool,
  GitShowTool,
  GitStatusTool,
  GitSwitchTool,
  GitUnstageTool,
  ListFilesTool,
  MoveFileTool,
  ReadFileTool,
  SearchTextTool,
  WorkspaceTreeTool,
  WriteFileTool,
} from './local';
import { SelectedTextTool } from './local/selection';
import { WebFetchTool } from './remote';
import { Tool } from './tool';
import { ToolAccessGuard } from './tool_access_guard';
import { ToolRegistry } from './tool_registry';

// Every tool the extension itself provides. There is no tool that runs an arbitrary program or shell command:
// what the AI can do is exactly this list plus the MCP tools the user configured.
export function createBuiltInTools(accessGuard: ToolAccessGuard, files: FileToolServices): Tool[] {
  // write_file is composed: it reads through read_file, the low-level tool.
  const readFile = new ReadFileTool(accessGuard, files.versions);

  return [
    readFile,
    new ListFilesTool(accessGuard),
    new SearchTextTool(accessGuard),
    new SelectedTextTool(getSelectedText),
    new WorkspaceTreeTool(getWorkspaceFiles),
    new CreateFileTool(accessGuard),
    new EditFileTool(accessGuard),
    new WriteFileTool(accessGuard, readFile, files.versions, files.writes),
    new DeleteFileTool(accessGuard),
    new MoveFileTool(accessGuard),
    new WebFetchTool(accessGuard),
    new GitStatusTool(accessGuard),
    new GitDiffTool(accessGuard),
    new GitLogTool(accessGuard),
    new GitShowTool(accessGuard),
    new GitBranchListTool(accessGuard),
    new GitAddTool(accessGuard),
    new GitUnstageTool(accessGuard),
    new GitCommitTool(accessGuard),
    new GitBranchCreateTool(accessGuard),
    new GitSwitchTool(accessGuard),
    new GitFetchTool(accessGuard),
    new GitPullTool(accessGuard),
    new GitPushTool(accessGuard),
  ];
}

// The tools offered to the model. A tool that cannot be used now (read-only mode, denied, untrusted workspace) is
// left out and recorded with its reason, so the model knows it cannot do that and can say so. Whether an operation
// may run, and whether the user is asked first, is decided later by the access guard.
export function createDefaultToolRegistry(accessGuard: ToolAccessGuard, files: FileToolServices): ToolRegistry {
  const registry = new ToolRegistry();

  for (const tool of createBuiltInTools(accessGuard, files)) {
    const reason = accessGuard.unavailableReason(tool);

    if (reason) {
      registry.markUnavailable(tool, reason);
    } else {
      registry.register(tool);
    }
  }

  return registry;
}
