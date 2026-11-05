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

Existing-file updates use a persistent write pipeline with safety copy, persisted state transitions, integrity verification, restoration and interrupted-operation recovery.

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

A stored `deny` always wins.

Otherwise, a current-session decision is more specific than an all-sessions decision.

An explicit `ask` still requires confirmation even when a remembered resource grant exists.

### Protected Resources

Protected resources always require a fresh confirmation.

Remembered resource grants never bypass this.

Protected resources include sensitive files such as environment files, keys, Git metadata, SSH configuration and credential files.

Additional patterns can be configured with `bezotcorpAi.protectedPaths`.

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
