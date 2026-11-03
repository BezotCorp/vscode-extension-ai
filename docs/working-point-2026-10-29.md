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

The bridge listens on `127.0.0.1`. Requests carrying an `Origin` header, or a `Host` that is not a loopback name, are refused with 403 (browser pages and DNS rebinding). `/active-file` and `/open-files` leave out protected resources. There is no write endpoint: the former `/patch` was removed because a program outside the conversation has no read context, which `update_file` requires.

## Conversations

| Component          | Implementation                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| Session storage    | JSON persistence in `chat.json`                                                                     |
| Session management | Multiple conversations and session switching                                                        |
| Messages           | User and assistant messages; assistant messages keep their tool rounds          |
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
- Without tools, tool messages are not sent; the system prompt then states that the model has no tools and cannot change files.
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

Twenty-eight built-in tools are created by `src/tools/default_tools.ts`. No tool runs a shell command, a script or an arbitrary program: the AI can do exactly what these tools and the configured MCP tools allow.

| Tool                  | Operation                                                       | Default |
| --------------------- | --------------------------------------------------------------- | ------- |
| `read_file`           | Read file content                                               | allow   |
| `read_files`          | `read_file` for several files (plural form, see below)          | allow   |
| `list_files`          | List filesystem entries                                         | allow   |
| `search_text`         | Search file content (skips protected and unreadable files)      | allow   |
| `selectedText`        | Read selected editor text                                       | allow   |
| `workspaceTree`       | Retrieve workspace structure                                    | allow   |
| `create_file`         | Create a file                                                   | ask     |
| `create_files`        | `create_file` for several files                                 | ask     |
| `update_files`        | `update_file` for several files                                 | ask     |
| `update_file`         | Change an existing file: one exact piece of text, or the whole content | ask |
| `delete_file`         | Move a file or folder to the trash                              | ask     |
| `delete_files`        | `delete_file` for several files                                 | ask     |
| `move_file`           | Move a file or folder, with a single confirmation               | ask     |
| `move_files`          | `move_file` for several files                                   | ask     |
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

### Levels of access

The runtime works out the level an operation needs from its paths (`ToolAccessGuard.accessFor`); the model only announces one in the optional `access` argument of `create_file`, `update_file`, `delete_file` and `move_file`, and so of their plural tools, which add no rule of their own (`AccessRequest`: `normal`, `elevated`, or `critical` with a `reason`).

| Level      | When                                                                                                                                                                                                  | Behavior                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `normal`   | A path inside the current window (the folders the interface has open) | The ordinary permission and autonomy rules |
| `elevated` | A path outside the current window that is not critical | Always an explicit confirmation; never covered by `allow`, `acceptEdits` or `auto` |
| `critical` | Creating, writing, moving or deleting a critical target: a folder of the current window or one of its parents, the home folder or one of its parents (including the root), `.git` of such a folder and everything below it, or a system location (`src/workspace/critical_path.ts`), even inside the current window or the home folder. Reading and searching are never critical | A non-empty reason from the AI, then a strong confirmation each time (Yes or No only), in every autonomy mode; no permanent permission suffices |

The current window is the perimeter the user has open; a structural workspace (Cargo, monorepo) is only information and grants nothing. An announcement lower than the real level is not an error: the real level applies and the user is asked if needed, without going back to the model (so `normal` announced for an `elevated` operation costs no extra model round). A `critical` operation without a non-empty reason is refused before any effect with reason `critical_justification_required`, a result the model can correct by calling again with `access: {"kind":"critical","reason":"..."}`; it is the one case that needs another model round. The dialog shows the exact action, the targets, why the location is critical, the AI's reason and a warning written by the extension. Deny decisions, read-only mode, trust and refusals earlier in the answer still apply first. A refused action returns `user_refused` for that action only; the rest of the answer goes on.

### Model and Tool Interaction

1. Send the current request to the model.
2. Receive a model response containing tool calls.
3. Resolve the corresponding tools.
4. Check their permissions.
5. Execute authorized tools.
6. Return tool results to the model.
7. Continue generating the response.

The loop limits rounds (8) and calls per response (8), stops on cancellation between rounds and between calls, blocks repetition of calls with an uncertain outcome, caps the size of each result, and reports every round (also an interrupted one) so it can be stored.

### `update_file`, `create_file` and the plural tools

`update_file` is the only operation that changes an existing file. The AI gives `path` with either `old_text` and `new_text` (one exact piece of text that appears once, CRLF tolerated, BOM kept) or `content` (the whole file). The former patch workflow (fenced `patch` blocks, preview, accept/reject, separate application) no longer exists: what produced the change lives here, the exact single-match search (`unique_match.ts`) and the diff (`diff_builder.ts`). Both forms become the same thing, the projection: the exact bytes the file must contain afterwards. Then one chain applies: read through `read_file` in composed mode, check the context the AI worked from, permission with the diff of the projection, revalidation after the dialog (same file, same projection, no unsaved changes), then the persistent pipeline.

`read_file` is the low-level tool. It computes the SHA-256 of the bytes it read; the SHAs stay internal (`FileVersionTracker`) and are never sent to the model. It has an internal binary mode (`src/tools/local/filesystem/read_mode.ts`): `0` for a direct call by the AI, `1` for a call from a composed tool, which reads the filesystem and remembers nothing. A file open with unsaved changes is read from the editor and nothing is remembered for it.

Two roles for SHAs:

1. Is the context injected into the AI still true? A direct `read_file` remembers the SHA of the whole file and the part the AI really received. The tool applies every limit (the size of a file, then the size of the whole result, known from `ToolExecutionContext.maxResultChars`) before remembering anything, so what is kept is what is in the result (`deliverFileContent`, `fitToolResult`); a part is cut on whole lines. The tracker lives for one generation: earlier turns reach the model cut down or not at all, so a file read in an earlier turn must be read again. The whole-file SHA is a fast path, valid only when the AI received the entire file. Otherwise a local change goes on only if a part the AI received (not the whole file) is still, as received, in the current file and holds the place of the change; `old_text` only says where the change goes. A whole replacement needs the entire file, current. If the context is no longer valid, nothing is written, no safety copy is made, no persistent operation starts, and the current content is returned to the model, which then holds that version. `max_retry = 2`: the initial attempt and two retries; a conflict after the second retry stops the operation for good, the user is told by a VS Code warning and the result carries a structured `update_file_stopped` event, stored with the conversation turn. After a successful update the AI knows the whole new file if its whole context was valid, otherwise the part it worked from, with its own change in it. After `create_file` it knows the content it wrote.
2. Is the written file what was intended? The SHA of the projected bytes is the expected SHA of the pipeline: projection, expected SHA, write, read back, real SHA. It is never exposed to the AI.

`create_file` has no original to protect, so no safety copy and no pipeline: the permission, protected paths and exclusive creation (`wx`) are its protections.

The persistent part is a state machine stored in SQLite (`src/state_machine/`, `StateMachine`, `StateMachineDatabase`), not tied to one tool: a definition (initial state and allowed transitions), a record per operation with its identity, resume data, payload, owning process and one `state`, transitions checked against the definition and applied only from the state that was read. The database is `file-operations.sqlite` in the extension's global storage and uses `node:sqlite`. `update_file` is its first use, with the 13 states `ready_to_copy` to `restore_failed` and the transitions of its specification, plus `update_failed -> restore_file` when the write may have started (`src/tools/local/filesystem/write_file_machine.ts`; the pipeline and its kind keep their `write_file` name: they are the physical write). `WriteFilePipeline` runs one step per state: safety copy (checked against the SHA of the original), write (refused if the file is neither the original nor already the projected content), integrity check (SHA of the file read back against the projected SHA), restoration from the copy checked against the original SHA. The copy is deleted at the end except after `restore_failed`, where the user is told where it is. At activation, operations left unfinished by a process that is gone are resumed from their last state and the user is told.

Plural tools (`read_files`, `create_files`, `update_files`, `move_files`, `delete_files`, `BatchFileTool`) take `files`, a list of up to 20 objects with the arguments of the singular tool, and call it for each item in order. They share the singular tool's permission identity (listed once in the manager) and add nothing to what happens to a file. There is no global transaction: an item that fails does not stop the others, and the result lists every outcome in `details.results` (`partial_failure` or `all_failed` when not all succeeded). The whole result must fit one limit, so each item gets an equal share of what is left once the wrapper is counted; all the items are handled in one tool call, in one model round, with no model call between them.

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
| Accept edits | `acceptEdits` | File-changing tools go ahead inside the current window; everything else follows its decision |
| Automatic    | `auto`        | Ordinary operations do not ask inside the current window; explicit `ask`, protected resources, elevated and critical operations still ask |

`deny` applies in every mode.

### Order of evaluation

Workspace trust (git and MCP tools), `deny`, read-only mode, refusals earlier in the same answer, critical operations (reason required, then a confirmation each time), protected resources (always asked, in every mode, never covered by `allow`) and paths outside the current window (always asked, covered by neither `allow`, `acceptEdits` nor `auto`), explicit `ask`, `allow`, the autonomy mode, then the dialog.

### Protected resources

Built-in patterns (`.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, `.npmrc`, `.pypirc`, `.netrc`, `.git-credentials`, `.git`, `.ssh`, `.aws`, `.gnupg`, `.kube`; files ending in `.example`, `.sample`, `.template` or `.dist` are not protected) plus `bezotcorpAi.protectedPaths`. A bare name or glob matches any path segment; `//abs`, `~/` and workspace-relative forms are accepted. A protected path in a call forces a dialog offering only Yes and No. Protected files are left out of the context, searches, git diffs and shows, and the local bridge.

### Dialog and manager

- At a call, the dialog states what the tool wants to do, shows the detail (diff for `update_file`, staged files for `git_commit`, destination for a move, body description for a request), and offers Yes, "Yes, for this session", "Yes, in this workspace", "Yes, always" and No. When a standing decision would not apply (protected resource, outside the current window, tool set to ask), only Yes and No are offered. After No, an input box lets the user tell the AI what to do instead. Tool-provided detail is sanitized line by line and bounded. A closed dialog is reported to the model as "no decision", not as a refusal.
- `BezotCorp AI: Manage Permissions` lists every tool (built-in by group, MCP by server) with its effective decision and where it comes from; a tool can be set to allow, ask, deny or back to its default at session, workspace or global scope, and decisions can be reset per scope. The same dialog opens the protected paths setting. `BezotCorp AI: Revoke All Permissions` clears the three scopes; `BezotCorp AI: Open Permission Settings` opens the setting.

### Refusals

A refusal is kept for the answer, keyed by effect: file tools share `content:` and `removal:` keys per path, `web_fetch` a `net:` key per host, other tools their own identity and resources. The model is told not to retry or reach the same effect another way.

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
