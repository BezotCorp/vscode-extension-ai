import {
  CreateFilesTool,
  CreateFileTool,
  DeleteFilesTool,
  DeleteFileTool,
  type FileToolServices,
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
  MoveFilesTool,
  MoveFileTool,
  ReadFilesTool,
  ReadFileTool,
  SearchTextTool,
  UpdateFilesTool,
  UpdateFileTool,
} from './local';
import { FileVersionTracker } from './local/filesystem/file_version_tracker';
import { WebFetchTool } from './remote';
import type { Tool } from './tool';
import type { ToolAccessGuard } from './tool_access_guard';
import { ToolRegistry } from './tool_registry';

// Every tool the extension itself provides. There is no tool that runs an arbitrary program or shell command:
// what the AI can do is exactly this list plus the MCP tools the user configured.
// `versions` is what the model received of the files during one generation; a new one is made for each.
export function createBuiltInTools(
  accessGuard: ToolAccessGuard,
  files: FileToolServices,
  versions = new FileVersionTracker(),
): Tool[] {
  // update_file is composed: it reads through read_file, the low-level tool. Each plural tool hands its files one by
  // one to its singular tool and shares its permission.
  const readFile = new ReadFileTool(accessGuard, versions);
  const createFile = new CreateFileTool(accessGuard, versions);
  const updateFile = new UpdateFileTool(accessGuard, readFile, versions, files.writes);
  const deleteFile = new DeleteFileTool(accessGuard);
  const moveFile = new MoveFileTool(accessGuard);

  return [
    readFile,
    new ReadFilesTool(readFile),
    new ListFilesTool(accessGuard),
    new SearchTextTool(accessGuard, readFile),
    createFile,
    new CreateFilesTool(createFile),
    updateFile,
    new UpdateFilesTool(updateFile),
    deleteFile,
    new DeleteFilesTool(deleteFile),
    moveFile,
    new MoveFilesTool(moveFile),
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
