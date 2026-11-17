# BezotCorp AI — Working Point

**Date:** 2026-10-29
**Scope:** Implemented source code as of this date.

This document records the actual implementation present in the repository. It does not contain future work, proposals, or development priorities.

## VS Code Extension

| Component             | Implemented functionality                           | Source                                 |
| --------------------- | --------------------------------------------------- | -------------------------------------- |
| Extension activation  | Extension lifecycle and command registration        | `src/extension.ts`                     |
| Chat interface        | VS Code webview integration                         | `src/webview/chat_view_provider.ts`    |
| Generation controller | Conversation generation and interruption handling   | `src/webview/generation_controller.ts` |
| Configuration         | Provider, model, context and extension settings     | `src/config/extension_config.ts`       |
| Local bridge          | HTTP integration with selected VS Code capabilities | `src/server/`                          |

## Conversations

The extension implements chat sessions and message handling, including session creation, selection, renaming, deletion, and persistent storage.

| Component          | Implementation                                    |
| ------------------ | ------------------------------------------------- |
| Session storage    | JSON persistence in `chat.json`                   |
| Session management | Multiple conversations and session switching      |
| Messages           | User and assistant messages                       |
| Generation         | Progressive display and cancellation              |
| Persistence        | Complete JSON serialization and filesystem writes |

The existing persistence code handles write failures by logging them internally.

## AI Providers

| Provider       | Implemented functionality                                                     |
| -------------- | ----------------------------------------------------------------------------- |
| Ollama         | Chat generation, streaming, model discovery, connection checks and tool calls |
| Custom backend | HTTP communication, health checks and JSON chat responses                     |

The repository contains a provider abstraction, provider factory and model-management functionality.

The Ollama provider implements tool calling within the current model interaction. Its request construction initializes the conversation sent to the model using a system message and the current user message.

## Workspace Context

The context builder collects information from the VS Code workspace.

| Source          | Implemented functionality                    |
| --------------- | -------------------------------------------- |
| Selected text   | Retrieves editor selection                   |
| Active document | Includes active file context                 |
| Open documents  | Includes open file context                   |
| Workspace       | File and directory information               |
| Context modes   | Basic and rich modes                         |
| Context preview | Displays collected context before submission |

The code also implements content limits and workspace path resolution.

## Built-in Tools

Eleven built-in tools are registered by `src/tools/default_tools.ts`.

| Tool                | Operation                    |
| ------------------- | ---------------------------- |
| `ReadFileTool`      | Read file content            |
| `ListFilesTool`     | List filesystem entries      |
| `SearchTextTool`    | Search file content          |
| `SelectedTextTool`  | Read selected editor text    |
| `WorkspaceTreeTool` | Retrieve workspace structure |
| `CreateFileTool`    | Create a file                |
| `WriteFileTool`     | Write file content           |
| `DeleteFileTool`    | Delete a file                |
| `MoveFileTool`      | Move a file                  |
| `RunCommandTool`    | Execute a command            |
| `WebFetchTool`      | Fetch remote content         |

The tool infrastructure includes registration, definitions, input validation, execution contexts, execution results, access guards and the tool execution loop.

### Model and Tool Interaction

The implemented Ollama interaction follows this sequence:

1. Send the current request to the model.
2. Receive a model response containing tool calls.
3. Resolve the corresponding tools.
4. Check their execution permissions.
5. Execute authorized tools.
6. Return tool results to the model.
7. Continue generating the response.

The implementation has explicit execution limits for tool-call processing.

## MCP Integration

| Component            | Implementation                    | Source                         |
| -------------------- | --------------------------------- | ------------------------------ |
| Server configuration | MCP server settings               | `src/mcp/mcp_server_config.ts` |
| MCP client           | Communication with MCP servers    | `src/mcp/mcp_client.ts`        |
| MCP manager          | Server and client management      | `src/mcp/mcp_manager.ts`       |
| MCP tools            | Tool representation and execution | `src/mcp/mcp_tool.ts`          |
| Tool information     | MCP tool metadata                 | `src/mcp/mcp_tool_info.ts`     |

MCP tools are integrated into the extension's existing tool infrastructure.

## Permissions

The extension implements three autonomy modes.

| Mode         | Identifier |
| ------------ | ---------- |
| Read-only    | `readOnly` |
| Confirmation | `confirm`  |
| Automatic    | `auto`     |

The implementation includes permission requests, decisions, capabilities, scopes, grants, persisted authorizations, scope coverage and permission management.

The tool-access guard connects these permissions to tool execution.

## Patch Workflow

The repository implements patch detection, preview, diff rendering, acceptance, rejection and application through VS Code workspace edits.

## Documentation and Delivery

| File                            | Existing content                               |
| ------------------------------- | ---------------------------------------------- |
| `README.md`                     | Extension presentation and usage documentation |
| `CHANGELOG.md`                  | Published change history                       |
| `docs/memory_ai_system.md`      | Persistent memory specification                |
| `.github/workflows/release.yml` | GitHub Actions release workflow                |
| `.releaserc.json`               | Semantic-release configuration                 |
| `package.json`                  | Extension metadata, scripts and dependencies   |
| `pnpm-lock.yaml`                | Dependency lockfile                            |

## Implementation Reference

This document records functionality implemented in the source code exported on 2026-10-29. It does not claim runtime validation or successful build execution that was not recorded during this review.
