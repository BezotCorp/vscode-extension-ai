# BezotCorp AI

![BezotCorp AI](assets/banner.png)

**A configurable, local-first AI coding assistant for VS Code.**

BezotCorp AI connects VS Code to local or remote AI providers and gives AI assistants access to your workspace context directly inside VS Code.

Use Ollama today, connect your own backend, or integrate future BezotCorp services.

---

## Features

### AI Chat

Chat directly with AI inside VS Code.

- Streaming responses
- Stop generation support
- Context-aware conversations
- Multiple chat sessions
- Persistent session storage
- Session switching
- Session rename
- Session deletion
- Provider abstraction
- Backend health monitoring

### Model Management

Choose and manage the model used by the assistant.

- Active model display
- Model selector
- Manual model entry
- Ollama model discovery
- Model refresh
- Persisted model selection
- Custom backend model support

### Context

The active editor file is attached automatically when available. Additional project context is discovered through explicit tools.

- Active file context
- `list_files` for project structure discovery
- `read_file` / `read_files` for known paths
- `search_text` for content discovery

### File Changes

A single tool, `update_file`, changes an existing file.

- Either an exact piece of text to replace (a text that appears several times is refused instead of guessed) or the whole content
- The diff is shown in the permission dialog
- The change only goes ahead if what the AI read is still true; otherwise it receives the current content
- Safety copy, write, integrity check and restoration

### AI Providers

Supported providers:

- Ollama
- Custom Backend
- Future BezotCorp Backend

### Connection Management

Built-in backend monitoring.

- Connection testing
- Status indicator
- Provider diagnostics

### Tools and Agent Workflows

The AI can use tools when the provider supports tool calling (Ollama). It only does what an explicit tool allows: there is no tool that runs a shell command, a script or an arbitrary program, and the model is told what is unavailable so it says so instead of improvising.

- Files: list, read, search, create, edit (exact text replacement), write, move and delete; project context is discovered explicitly
- Web: fetch a page
- Git, as specialised tools with bounded parameters: `git_status`, `git_diff`, `git_log`, `git_show`, `git_branch_list`, `git_add`, `git_unstage`, `git_commit`, `git_branch_create`, `git_switch`, `git_fetch`, `git_pull` (fast-forward only), `git_push` (no force). There is no reset, rebase, merge, stash, checkout of files or amend
- MCP servers over stdio, configured in user settings (`bezotcorpAi.mcpServers`); each MCP tool is controlled on its own
- Permissions separate tool capability from filesystem resource access. A tool may be `allow`, `ask` or `deny`, for the current session (`currentSession`) or for all sessions (`allSessions`). Files explicitly opened in the current VS Code window form the implicit filesystem perimeter. Outside resources can be authorized once, for the current session or for all sessions. Cargo, pnpm and Node workspaces are detected structurally so the user can authorize the detected workspace when appropriate; detection itself never grants access
- Autonomy modes: read-only, confirmation, accept edits, automatic
- Protected resources (`.env`, keys, `.npmrc`, `.git`, `.ssh`…, extendable with `bezotcorpAi.protectedPaths`) always ask and never inherit remembered resource permissions. Critical operations also require a reason from the AI and a fresh confirmation every time. A path outside the current window asks unless the same tool already has a matching explicit resource permission; a detected structural workspace may be authorized without silently authorizing unrelated external paths
- A refusal covers every route to the same effect during the answer
- Earlier turns, including tool calls and results, are sent back to the model
- Without tool calling, the AI cannot change files
- Model management foundation
- Interface in French and English, following the VS Code display language

### Local First

Keep full control of your infrastructure.

- Self-hosted AI support
- Local models with Ollama
- Remote backends supported
- No mandatory cloud dependency

---

## Installation

Install the extension from:

- Visual Studio Marketplace
- Open VSX Registry

---

## Configuration

### Configure Ollama

```json
{
  "bezotcorpAi.provider": "ollama",
  "bezotcorpAi.providerUrl": "http://127.0.0.1:11434",
  "bezotcorpAi.model": "qwen2.5-coder:7b"
}
```

### Configure a Custom Backend

```json
{
  "bezotcorpAi.provider": "customBackend",
  "bezotcorpAi.providerUrl": "http://127.0.0.1:4188",
  "bezotcorpAi.model": "custom-model"
}
```

## Commands

### Open Chat

```text
BezotCorp AI: Open Chat
```

### Open Settings

```text
BezotCorp AI: Open Settings
```

---

## Architecture

```text
VS Code Extension
        │
        ├── Chat UI
        ├── Chat Sessions
        ├── Context Builder
        ├── Model Management
        ├── Tools, MCP and Permissions
        └── AI Provider
                │
                ├── Ollama
                ├── Custom Backend
                └── Future BezotCorp Backend
```

The extension manages context collection, model selection, provider integration, chat sessions, file changes and streaming responses directly inside VS Code.

---

## Privacy

BezotCorp AI does not require any cloud service.

Privacy depends on the provider you choose.

### Ollama Privacy

- Local execution
- Local models
- Local data

### Custom Backend Privacy

- Privacy depends on your infrastructure

### Future BezotCorp Backend Privacy

- Policy will be documented separately

---

## Current Features

### Implemented

- AI chat
- Streaming responses
- Stop generation
- Multiple chat sessions
- Persistent session storage
- Session switching
- Session rename
- Session deletion
- Active model display
- Model selector
- Manual model entry
- Ollama model discovery
- Model refresh
- Persisted model selection
- Backend status monitoring
- Connection testing
- Ollama integration
- Custom backend integration
- VS Code commands
- Tool calling with permissions (Ollama)
- File, git and web tools
- MCP client over stdio
- Conversation history with tool traffic

### Planned

- Multi-file editing
- Workspace semantic graph
- Agent orchestration
- Memory integration
- Provider profiles
- Model capability profiles

### Future

- Multi-agent collaboration
- Autonomous coding workflows
- Project knowledge graph
- Native Rust ecosystem integration

---

## License

MIT License

Copyright (c) BezotCorp
