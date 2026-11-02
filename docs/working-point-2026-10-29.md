# BezotCorp AI — Working Point

**Date:** 2026-10-29
**Scope:** Implemented source code as of this date.

This document records the actual implementation present in the repository. It does not contain future work, proposals, or development priorities.

## VS Code Extension

| Component             | Implemented functionality                                                                  | Source                                 |
| --------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| Extension activation  | Extension lifecycle, command registration, configuration listeners for MCP                 | `src/extension.ts`                     |
| Chat interface        | VS Code webview integration                                                                | `src/webview/chat_view_provider.ts`    |
| Generation controller | Conversation generation, interruption, history selection, MCP tool loading                 | `src/webview/generation_controller.ts` |
| Configuration         | Provider, model, context, autonomy, tool permissions, protected paths, MCP servers, context window settings | `src/config/extension_config.ts`       |
| Local bridge          | HTTP integration with selected VS Code capabilities, restricted to local programs          | `src/server/`                          |

Security-sensitive settings (`autonomyMode`, `permissions`, `protectedPaths`, `mcpServers`) have application scope and are read from user settings only.

### Local bridge

The bridge listens on `127.0.0.1`. Requests carrying an `Origin` header, or a `Host` that is not a loopback name, are refused with 403 (browser pages and DNS rebinding). `/active-file` and `/open-files` leave out protected resources. `/patch` runs the `edit_file` tool, so the tool's permission, the autonomy mode, the confirmation dialog and the exact single-match rule apply; the request body is limited to 1 MB.

## Conversations

| Component          | Implementation                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| Session storage    | JSON persistence in `chat.json`                                                                     |
| Session management | Multiple conversations and session switching                                                        |
| Messages           | User and assistant messages; assistant messages keep their tool rounds and patch decisions          |
| Generation         | Progressive display and cancellation                                                                |
| Persistence        | Write to `chat.json.tmp` then rename; errors are raised to the caller and shown to the user         |
| Unreadable file    | A `chat.json` that cannot be read or has an unknown format is copied to `chat.unreadable-*.json`    |
| Display            | Stored tool calls are shown with the same `[tool]` lines as during generation                       |

## AI Providers

| Provider       | Implemented functionality                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Ollama         | Chat generation, streaming, model discovery, connection checks, tool calls, context sizing        |
| Custom backend | HTTP communication, health checks and JSON chat responses (no tools, no context sizing)           |

The repository contains a provider abstraction, provider factory and model-management functionality.

### History and context window

- Earlier turns of the active conversation are sent to the model, oldest first, including tool calls and their results.
- The context window is `bezotcorpAi.contextTokens` (default 16384), lowered to the model's own `context_length` read from Ollama `/api/show`, and sent as `num_ctx`.
- Assuming 3 characters per token: earlier turns may take 40% of the window, the system prompt (selection and files) 40%, one tool result 25%, and tool traffic stops at 90% (the model is then made to answer).
- When over budget the system prompt drops other open files first, then cuts the active file, then the selection. A turn whose tool results exceed the budget is kept as text only; the latest turn is cut rather than dropped.
- Without tools, tool messages are not sent; the system prompt then states that the model has no tools and describes the `patch` block format.
- With tools, the system prompt states that the model can only act through the listed tools, cannot run commands, scripts or tests, must say plainly what it cannot do and give the command for the user to run, and lists the tools that are not offered with the reason (read-only mode, denied, untrusted workspace).

## Workspace Context

| Source          | Implemented functionality                                         |
| --------------- | ----------------------------------------------------------------- |
| Selected text   | Retrieves editor selection                                        |
| Active document | Includes active file context                                      |
| Open documents  | Includes open file context                                        |
| Workspace       | File and directory information                                    |
| Context modes   | Basic and rich modes                                              |
| Context preview | Displays collected context before submission                      |
| Protection      | Protected resources never enter the context                       |

The code also implements content limits and workspace path resolution. Path resolution supports multi-root workspaces: a relative path starts at the first folder, may start with a folder name, or is found in the only folder that contains it; every folder counts as the workspace for implicit reads and protected paths.

## Built-in Tools

Twenty-four built-in tools are created by `src/tools/default_tools.ts`. No tool runs a shell command, a script or an arbitrary program: the AI can do exactly what these tools and the configured MCP tools allow.

| Tool                  | Operation                                                       | Default |
| --------------------- | --------------------------------------------------------------- | ------- |
| `read_file`           | Read file content                                               | allow   |
| `list_files`          | List filesystem entries                                         | allow   |
| `search_text`         | Search file content (skips protected and unreadable files)      | allow   |
| `selectedText`        | Read selected editor text                                       | allow   |
| `workspaceTree`       | Retrieve workspace structure                                    | allow   |
| `create_file`         | Create a file                                                   | ask     |
| `edit_file`           | Replace one exact piece of text that appears once               | ask     |
| `write_file`          | Replace the whole content of a file                             | ask     |
| `delete_file`         | Move a file or folder to the trash                              | ask     |
| `move_file`           | Move a file or folder, with a single confirmation               | ask     |
| `web_fetch`           | Fetch remote content                                            | ask     |
| `git_status`          | Branch and changed, staged and untracked files                  | allow   |
| `git_diff`            | Unstaged, staged or revision diff, optionally per path          | allow   |
| `git_log`             | Recent commits, optionally per revision and path                | allow   |
| `git_show`            | One commit with its stat and diff                               | allow   |
| `git_branch_list`     | Local and remote-tracking branches                              | allow   |
| `git_add`             | Stage explicit paths                                            | ask     |
| `git_unstage`         | Remove explicit paths from the index                            | ask     |
| `git_commit`          | Commit the index with a message                                 | ask     |
| `git_branch_create`   | Create a branch                                                 | ask     |
| `git_switch`          | Switch to an existing branch                                    | ask     |
| `git_fetch`           | Fetch a configured remote                                       | ask     |
| `git_pull`            | Fast-forward pull from a configured remote                      | ask     |
| `git_push`            | Push a branch to a configured remote                            | ask     |

The tool infrastructure includes registration (with the tools left out and why), definitions, input validation, execution contexts, execution results, the access guard and the tool execution loop. A tool that is denied, not allowed by the autonomy mode, or needs a trusted workspace is not offered to the model.

### Git tools

`src/tools/local/git/` holds one class per tool on a common base. The only program started is `git`, without a shell, with arguments built by the tool from validated parameters: revisions and branch names cannot start with `-` and revisions cannot contain `:`; remotes are configured remote names (no URL); paths must lie inside the repository and are passed as literal pathspecs after `--`; counts and message sizes are bounded; there is no raw argument, no force, no amend, no `-a`, no reset, rebase, merge or stash. Every command is preceded by options that disable the file system monitor, the pager and external protocol helpers, and runs without any prompt (`GIT_TERMINAL_PROMPT=0`, no editor, SSH in batch mode) with a reduced environment. `git_diff` and `git_show` leave protected files out through exclude pathspecs, and disable external diff drivers and textconv. `git_commit` refuses an empty index and shows the staged files in its dialog. Output is bounded; timeouts, cancellation and non-zero exits are reported with whether the command may have partly run. Repository hooks run on commit. Git tools need a trusted workspace. In a multi-root workspace the `folder` parameter names the repository.

### `edit_file`

Reads the file through the guard first (a match reveals content), requires `old_text` to match exactly once (CRLF tolerated, BOM kept), shows the change as a diff in the permission dialog, checks that the file is unchanged after the dialog, then edits through `WorkspaceEdit` for open files or on disk otherwise. Files with unsaved changes are refused.

### Hard protections

`delete_file` and `move_file` refuse the workspace folders and their parents, the home folder and its parents, and `.git` of a workspace folder, in every autonomy mode.

### Model and Tool Interaction

1. Send the current request to the model.
2. Receive a model response containing tool calls.
3. Resolve the corresponding tools.
4. Check their permissions.
5. Execute authorized tools.
6. Return tool results to the model.
7. Continue generating the response.

The loop limits rounds (8) and calls per response (8), stops on cancellation between rounds and between calls, blocks repetition of calls with an uncertain outcome, caps the size of each result, and reports every round (also an interrupted one) so it can be stored.

### Patch workflow and `edit_file`

Both use the same exact single-match search (`src/patch/unique_match.ts`). Patch blocks are parsed without trimming, applied to the matched range only through `WorkspaceEdit`, and resolved with `resolvePath`. Patch ids derive from the content, accepted and rejected decisions are stored in the assistant message, and the previews of the last response are restored when a conversation is shown again. A patch being applied cannot be applied twice. Accepting a patch is the user's own decision and does not go through tool permissions.

### `read_file` and `write_file`

`read_file` is the low-level tool and `write_file` a composed tool built on it. `read_file` computes the SHA-256 of the bytes it read; the SHA stays internal (`FileVersionTracker`) and is never sent to the model. It has an internal binary mode (`src/tools/local/filesystem/read_mode.ts`): `0` for a direct call by the AI, which remembers the version the AI received, `1` for a call from a composed tool, which reads the filesystem and remembers nothing. A file open with unsaved changes is read from the editor and no SHA is remembered for it.

`write_file` starts by reading the file in mode `1` and compares its SHA with the version the AI received.

- Different, or never read: nothing is written, no safety copy is made, no persistent operation starts, and the current content is returned to the model, which then holds that version. `max_retry = 2`: the initial attempt and two retries; a conflict after the second retry stops the operation for good. The user is then told by a VS Code warning produced by the extension, and the result carries a structured `write_file_stopped` event (cause, final state `no_change_applied`, user informed, current content, do not repeat the previous attempt blindly, decide from the current state), stored with the conversation turn.
- Identical: the new content is projected in memory as exact bytes and its SHA becomes the reference for the result. The check is repeated after the permission dialog.

The persistent part is a state machine stored in SQLite (`src/state_machine/`, `StateMachine`, `StateMachineDatabase`), not tied to `write_file`: a definition (initial state and allowed transitions), a record per operation with its identity, resume data, payload, owning process and one `state`, transitions checked against the definition and applied only from the state that was read. The database is `file-operations.sqlite` in the extension's global storage and uses `node:sqlite`. `write_file` is its first use, with the 13 states `ready_to_copy` to `restore_failed` and the transitions of its specification, plus `update_failed -> restore_file` when the write may have started (`src/tools/local/filesystem/write_file_machine.ts`). `WriteFilePipeline` runs one step per state: safety copy (checked against the SHA of the original), write (refused if the file is neither the original nor already the projected content), integrity check (SHA of the file read back against the projected SHA), restoration from the copy checked against the original SHA. The copy is deleted at the end except after `restore_failed`, where the user is told where it is. At activation, operations left unfinished by a process that is gone are resumed from their last state and the user is told.

## MCP Integration

| Component            | Implementation                                                                                | Source                         |
| -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| Server configuration | MCP server settings (user scope)                                                              | `src/mcp/mcp_server_config.ts` |
| MCP client           | Stdio JSON-RPC client; the server receives a basic environment plus its configured variables   | `src/mcp/mcp_client.ts`        |
| MCP manager          | Start on demand, bounded and cancellable wait, restart backoff, idle stop, configuration sync | `src/mcp/mcp_manager.ts`       |
| MCP tools            | Tools with unique ids, bounded descriptions and structured content, each controlled under its own `mcp__server__tool` key | `src/mcp/mcp_tool.ts` |
| Tool information     | MCP tool metadata                                                                             | `src/mcp/mcp_tool_info.ts`     |

The permission manager can list the tools of the configured servers (`describeTools`). MCP tools default to ask, need a trusted workspace, and no server-wide decision exists: nothing is assumed about what a tool does internally. Servers are not started in an untrusted workspace and are stopped when it is closed, when their configuration changes, or after ten minutes without use. A message waits at most eight seconds for servers that are still starting. A failing server does not remove the built-in tools. Server names containing `/` or `__` are refused.

## Permissions

Control is by tool identity. Each tool has a default (`allow` for the reading and consulting tools, `ask` for the others, including every MCP tool) and a decision of `allow`, `ask` or `deny` may be kept for it at one of three scopes.

| Scope       | Kept in                                                   |
| ----------- | --------------------------------------------------------- |
| `session`   | Memory, until the window closes                           |
| `workspace` | The workspace state                                       |
| `global`    | The user setting `bezotcorpAi.permissions` (user scope)   |

A `deny` at any scope wins; otherwise the most specific scope decides (session, then workspace, then global); without a decision the tool's default applies. Decisions of the earlier model (per path and command) are discarded at activation.

### Autonomy modes

| Mode         | Identifier    | Behavior                                                                                     |
| ------------ | ------------- | -------------------------------------------------------------------------------------------- |
| Read-only    | `readOnly`    | Only tools that cannot change anything are offered                                           |
| Confirmation | `confirm`     | A tool asks unless it is allowed                                                             |
| Accept edits | `acceptEdits` | File-changing tools go ahead inside the workspace; everything else follows its decision      |
| Automatic    | `auto`        | Nothing asks, except tools explicitly set to `ask`                                           |

`deny` applies in every mode.

### Order of evaluation

Workspace trust (git and MCP tools), `deny`, read-only mode, refusals earlier in the same answer, protected resources (always asked, in every mode, never covered by `allow`) and paths outside the workspace (asked, never covered by `allow`; the automatic mode lets them through), explicit `ask`, `allow`, the autonomy mode, then the dialog.

### Protected resources

Built-in patterns (`.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, `.npmrc`, `.pypirc`, `.netrc`, `.git-credentials`, `.git`, `.ssh`, `.aws`, `.gnupg`, `.kube`; files ending in `.example`, `.sample`, `.template` or `.dist` are not protected) plus `bezotcorpAi.protectedPaths`. A bare name or glob matches any path segment; `//abs`, `~/` and workspace-relative forms are accepted. A protected path in a call forces a dialog offering only Yes and No. Protected files are left out of the context, searches, git diffs and shows, and the local bridge.

### Dialog and manager

- At a call, the dialog states what the tool wants to do, shows the detail (diff for `edit_file`, staged files for `git_commit`, destination for a move, body description for a request), and offers Yes, "Yes, for this session", "Yes, in this workspace", "Yes, always" and No. When a standing decision would not apply (protected resource, outside the workspace, tool set to ask), only Yes and No are offered. After No, an input box lets the user tell the AI what to do instead. Tool-provided detail is sanitized line by line and bounded. A closed dialog is reported to the model as "no decision", not as a refusal.
- `BezotCorp AI: Manage Permissions` lists every tool (built-in by group, MCP by server) with its effective decision and where it comes from; a tool can be set to allow, ask, deny or back to its default at session, workspace or global scope, and decisions can be reset per scope. The same dialog opens the protected paths setting. `BezotCorp AI: Revoke All Permissions` clears the three scopes; `BezotCorp AI: Open Permission Settings` opens the setting.

### Refusals

A refusal is kept for the answer, keyed by effect: file tools share `content:` and `removal:` keys per path, `web_fetch` a `net:` key per host, other tools their own identity and resources. The model is told not to retry or reach the same effect another way.

## Patch Workflow

The repository implements patch detection, preview, diff rendering, acceptance, rejection and application through VS Code workspace edits; see the section above for matching, persistence and deny rules.

## Documentation and Delivery

| File                            | Existing content                                       |
| ------------------------------- | ------------------------------------------------------ |
| `README.md`                     | Extension presentation, tools and permissions overview |
| `CHANGELOG.md`                  | Published change history                               |
| `docs/memory_ai_system.md`      | Persistent memory specification                        |
| `.github/workflows/release.yml` | GitHub Actions release workflow                        |
| `.releaserc.json`               | Semantic-release configuration                         |
| `package.json`                  | Extension metadata, scripts and dependencies           |
| `pnpm-lock.yaml`                | Dependency lockfile                                    |

## Implementation Reference

`pnpm compile` completes without errors on this code. Throwaway scripts outside the repository exercised the protected-resource matching, the precedence of decisions, the git parameter validators and the git runner against this repository (status, diff with exclusions, a failing command). The extension itself has not been run, and no test or test infrastructure exists.
