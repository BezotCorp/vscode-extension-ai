import { getSelectedText, getWorkspaceFiles } from '../context';
import {
  CreateFileTool,
  DeleteFileTool,
  ListFilesTool,
  MoveFileTool,
  ReadFileTool,
  SearchTextTool,
  WorkspaceTreeTool,
  WriteFileTool,
} from './local/filesystem';
import { RunCommandTool } from './local/process';
import { SelectedTextTool } from './local/selection';
import { WebFetchTool } from './remote';
import { ToolAccessGuard } from './tool_access_guard';
import { ToolRegistry } from './tool_registry';

// Every built-in tool is offered to the model. Availability only depends on the autonomy mode:
// read-only mode keeps the tools that can never change anything. Whether an operation may run, and whether
// the user is asked first, is decided later by the access guard.
export function createDefaultToolRegistry(accessGuard: ToolAccessGuard): ToolRegistry {
  const registry = new ToolRegistry();
  const tools = [
    new ReadFileTool(accessGuard),
    new ListFilesTool(accessGuard),
    new SearchTextTool(accessGuard),
    new SelectedTextTool(getSelectedText),
    new WorkspaceTreeTool(getWorkspaceFiles),
    new CreateFileTool(accessGuard),
    new WriteFileTool(accessGuard),
    new DeleteFileTool(accessGuard),
    new MoveFileTool(accessGuard),
    new RunCommandTool(accessGuard),
    new WebFetchTool(accessGuard),
  ];

  for (const tool of tools) {
    if (accessGuard.mode !== 'readOnly' || tool.readOnlyCompatible) {
      registry.register(tool);
    }
  }

  return registry;
}
