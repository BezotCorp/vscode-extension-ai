# BezotCorp AI — Architecture

This document describes the current technical architecture of BezotCorp AI.

Historical dated working-point documents are snapshots and are not updated when the implementation evolves.

## Extension Runtime

BezotCorp AI is a VS Code extension written in TypeScript.

The extension coordinates chat sessions, AI providers, model management, context preparation, built-in tools, MCP tools, permissions, filesystem safety, persistent file-operation recovery and the VS Code webview interface.

There is no arbitrary shell or generic command execution tool.

## AI Providers

The provider abstraction currently supports Ollama, custom backends and future BezotCorp backend integration.

Ollama supports the current tool-calling workflow.

The custom backend currently receives conversation history but does not yet expose tool support.

## Conversation Model

Conversations are stored as independent chat sessions.

A session contains a stable identifier, a title, creation and update timestamps, messages and optional archive and trash states.

The implementation supports creating, switching, renaming, archiving, restoring, trashing, permanently deleting and clearing conversations.

Archived and trashed sessions cannot become active until restored.

Conversation history preserves tool calls and tool results required by subsequent model turns.

## Context

The active editor file is attached automatically when available.

Additional project context is discovered explicitly through tools instead of automatically injecting the whole project.

Context discovery uses:

- `list_files`
- `read_file`
- `read_files`
- `search_text`

## Tool System

Built-in tools are registered explicitly.

A tool unavailable because of workspace trust, autonomy mode or a stored denial is not exposed as usable to the model.

There is no generic shell tool.

### Low-Level Operations and Composed Tools

Filesystem tools are either low-level tools or composed tools.

Low-level tools own the concrete operation they perform, while authorization policy remains centralized in the permission system.

`read_file` is the low-level path for acquiring existing file content. Before it obtains any file bytes, it consults `ToolAccessGuard`. The guard owns permission policy: stored `allow` / `ask` / `deny`, resource grants, protected-resource confirmation, workspace boundaries, autonomy mode and revocation state.

Internal read modes, SHA checks, retries and cache decisions never grant access and never bypass that permission check.

Any composed tool that needs existing file content must delegate the actual content acquisition to `read_file` instead of calling the filesystem directly or reimplementing protected-content rules.

In particular:

- `read_files` delegates each read to `read_file`;
- `search_text` uses `read_file` to obtain the content it searches;
- `update_file` uses `read_file` when it needs existing content before preparing or reporting an update.

Composed tools may have their own authorization for the effects they perform, for example `update_file` must authorize the write, but they must not create a second filesystem-content read path.

The same principle applies to other low-level operations: the operation is implemented once, while the central permission system decides whether the requested access or effect is allowed.

### Filesystem Tools

Read and discovery:

- `read_file`
- `read_files`
- `list_files`
- `search_text`

Creation:

- `create_file`
- `create_files`

Updates:

- `update_file`
- `update_files`

Moves:

- `move_file`
- `move_files`

Deletion:

- `delete_file`
- `delete_files`

Plural tools delegate to their singular counterpart so permission and safety semantics stay identical.

## File Update Safety

`update_file` supports exact text replacement and complete file-content replacement.

Ambiguous exact replacements are refused.

The extension tracks the exact file content delivered to the model during the generation.

Before applying an update, the extension verifies that the file still matches the content the model worked from.

A recheck is only a freshness check. It does not reuse or invent permission: if file content must be acquired again, the current permission state is consulted again before that content is read.

Existing-file updates use a persistent write pipeline with safety copy, persisted state transitions, integrity verification, restoration and interrupted-operation recovery. The pipeline's internal backup, SHA, integrity and restoration reads are implementation steps of the already-authorized write transaction; they are not model-facing content reads and do not inject file content into the AI context.

## Git Tools

Git is exposed through bounded dedicated tools:

- `git_status`
- `git_diff`
- `git_log`
- `git_show`
- `git_branch_list`
- `git_add`
- `git_unstage`
- `git_commit`
- `git_branch_create`
- `git_switch`
- `git_fetch`
- `git_pull`
- `git_push`

There is no generic Git command tool.

The built-in Git surface does not expose reset, rebase, merge, stash, arbitrary file checkout, amend or force push.

`git_pull` is fast-forward only.

## Web Tool

Remote web content can be requested through the dedicated web tool.

Web access does not use local filesystem resource-boundary semantics.

## MCP

MCP servers are configured by the user and started over stdio.

Each MCP tool has its own stable identity:

`mcp__server__tool`

MCP tools participate independently in the tool permission system.

## Permission Model

Tool permissions and filesystem resource permissions are separate.

### Tool Policies

A tool policy is one of:

- `allow`
- `ask`
- `deny`

A stored denial prevents execution.

### Permission Lifetimes

Permission decisions use two lifetimes:

- `currentSession`
- `allSessions`

Current-session decisions exist only in memory.

All-sessions tool decisions are persisted in VS Code user settings.

All-sessions resource grants are persisted separately in extension global state.

### Current VS Code Window

Folders explicitly opened in the current VS Code window form the implicit filesystem perimeter.

### Structural Workspaces

The extension detects structural project boundaries for Cargo, pnpm and Node/npm/yarn workspaces.

Detection never grants access automatically.

A detected structural workspace may be explicitly authorized for a specific tool.

### External Resources

A filesystem resource outside the current VS Code window requires explicit authorization unless the same tool already has a matching remembered grant.

Resource grants are tool-specific.

A grant may cover an exact resource, a directory or a detected structural workspace.

### Permission Resolution

Authorization is checked before the requested access or effect is performed.

A stored `deny` always wins.

Otherwise, a current-session decision is more specific than an all-sessions decision.

An explicit `ask` still requires confirmation even when a remembered resource grant exists.

A remembered authorization can make a later check succeed without showing another dialog, but it never removes the check itself. Revoking or changing a permission must therefore affect the next access immediately.

SHA equality, cached content, retries, rechecks and other technical state never imply authorization.

### Protected Resources

Protected resources always require a fresh confirmation when their content is read.

Remembered resource grants never bypass this.

Protected resources include sensitive files such as environment files, keys, Git metadata, SSH configuration and credential files.

Additional patterns can be configured with `bezotcorpAi.protectedPaths`.

Protection governs content access, never visibility.

A protected file may remain visible as a filesystem entry. `list_files` may expose its existence and path without exposing its contents. The active-file context and bridge may likewise expose the path while withholding the content.

The central permission system owns protected-resource policy. `read_file` enforces that policy by consulting it before each actual filesystem-content acquisition.

Any composed tool that needs existing file content must go through `read_file` and therefore inherits the same protected-resource behavior. `read_files`, `search_text`, `update_file` and future composed tools must not implement another filesystem-content read path or silently filter protected content on their own.

Git tools expose Git state and never filter what Git itself returns. If a sensitive file is versioned, that is part of the repository state and remains visible.

Generated or noisy directories (`node_modules`, `target`, `dist`, `out`, `build`, `.git`...) may be omitted from listings and broad searches by default for ergonomics only. This is not a security boundary. They remain explicitly accessible through `includeIgnored: true`.

### Critical Operations

Critical writes, moves, deletes and creates require an explicit critical-access request from the model, a reason and a fresh user confirmation.

Remembered grants never bypass critical confirmation.

### Refused Effects

When the user explicitly refuses an operation, that effect is remembered for the current generation.

The model cannot retry the same effect through another route during that generation.

Closing a permission dialog without refusing is not treated as a refusal.

## Autonomy Modes

The extension supports:

- `readOnly`
- `confirm`
- `acceptEdits`
- `auto`

Stored `deny` rules always apply.

Stored `ask` rules still require confirmation.

## Localization

The interface is available in English and French.

The displayed language follows the VS Code display language.

Model-facing protocol identifiers and tool identities remain stable and are not translated.

## Persistence

Chat history, persisted permissions and file-operation recovery state are stored separately according to their purpose.

Current-session permissions are intentionally not persisted.

## Current Validation Limits

Some runtime behavior still requires validation in the VS Code Extension Development Host.

---

[← Back to the developer guide](../FOR_DEVELOPERS.md)
