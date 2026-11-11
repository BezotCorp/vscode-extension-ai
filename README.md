# BezotCorp AI

![BezotCorp AI](assets/banner.png)

**A local-first AI coding assistant for VS Code.**

BezotCorp AI brings AI directly into VS Code while keeping you in control of the models, tools and infrastructure you use.

Use a local Ollama model, connect your own backend, and let the assistant read your project, modify files, work with Git, access configured MCP tools and keep multiple conversations inside VS Code.

---

## Why BezotCorp AI?

BezotCorp AI is designed for developers who want an AI assistant without giving up control of their environment.

- Use local models with Ollama
- Connect your own AI backend
- Keep conversations directly inside VS Code
- Let the AI inspect and modify project files
- Use dedicated Git tools
- Connect MCP servers
- Control what the AI is allowed to do
- Use the interface in English or French
- No mandatory cloud service

---

## AI Chat

Chat with your AI without leaving VS Code.

- Streaming responses
- Multiple conversations
- Persistent conversation history
- Rename conversations
- Archive and restore conversations
- Trash and permanently delete conversations
- Clear the current conversation
- Stop generation at any time
- Tool calls and results kept with the conversation

---

## Project Context

The assistant can inspect your project when it needs more context.

It can:

- Read files
- Read several files at once
- List folders and project structure
- Search text across files
- Use the active editor file as context

The AI does not automatically receive your entire project.

---

## File Operations

BezotCorp AI can make changes directly in your project.

It can:

- Create files
- Update existing files
- Modify several files in one tool call
- Move and rename files or folders
- Delete files or folders

For file updates, the extension checks that the file still matches the context the AI worked from before applying the change.

Existing-file updates also use safety copies and integrity verification so interrupted or invalid writes can be detected and recovered.

---

## Git Operations

The assistant can work with Git through dedicated operations.

Supported operations include:

- Status
- Diff
- Log
- Show commits
- List branches
- Stage and unstage files
- Create commits
- Create and switch branches
- Fetch
- Pull
- Push

There is no unrestricted shell or arbitrary Git command execution.

---

## MCP Integration

BezotCorp AI can connect to MCP servers configured by the user.

Each MCP tool is exposed separately and follows the extension permission system.

---

## Permissions and Safety

You stay in control of what the AI can do.

Tools can be:

- Allowed
- Confirmed before use
- Denied

Access outside the files and folders currently opened in VS Code requires explicit authorization.

Sensitive resources such as environment files, keys, Git metadata and other protected paths always require confirmation.

Critical operations require a fresh confirmation every time.

The extension also provides several autonomy levels, from read-only operation to more automatic workflows.

---

## Local-First Operation

BezotCorp AI does not require a cloud service.

With Ollama, your model and prompts can stay entirely on your machine.

You can also connect your own remote or self-hosted backend if you prefer.

---

## AI Providers

### Ollama Provider

Run local models directly on your machine.

Example:

```json
{
  "bezotcorpAi.provider": "ollama",
  "bezotcorpAi.providerUrl": "http://127.0.0.1:11434",
  "bezotcorpAi.model": "qwen2.5-coder:7b"
}
```

### Custom Backend Provider

Connect BezotCorp AI to your own backend.

```json
{
  "bezotcorpAi.provider": "customBackend",
  "bezotcorpAi.providerUrl": "http://127.0.0.1:4188",
  "bezotcorpAi.model": "custom-model"
}
```

---

## Installation

BezotCorp AI can be installed from:

- Visual Studio Marketplace
- Open VSX Registry

After installation, open the BezotCorp AI view from the VS Code activity bar.

---

## Available Commands

- `BezotCorp AI: Open Chat`
- `BezotCorp AI: Open Settings`
- `BezotCorp AI: Manage Permissions`
- `BezotCorp AI: Revoke All Permissions`
- `BezotCorp AI: Open Permission Settings`

---

## Languages

The interface is available in:

- English
- French

BezotCorp AI follows the VS Code display language.

---

## Privacy

Privacy depends on the provider you choose.

### Ollama Privacy

When Ollama runs locally:

- The model runs locally
- Prompts stay local
- Project data stays local

### Custom Backend Privacy

Data handling depends on the infrastructure you connect.

### Future BezotCorp Services Privacy

Privacy information will be documented separately before those services are made available.

---

## Development and Contributing

Want to understand the implementation or contribute to BezotCorp AI?

- [Architecture](docs/architecture.md) — current technical architecture and implementation boundaries
- [TODO](docs/todo.md) — remaining implementation and validation work

The extension is written in TypeScript for VS Code.

Install dependencies:

```bash
pnpm install
```

Compile the extension:

```bash
pnpm compile
```

Contributions should preserve the explicit tool boundaries, permission model and local-first design.

---

## License

MIT License

Copyright (c) BezotCorp
