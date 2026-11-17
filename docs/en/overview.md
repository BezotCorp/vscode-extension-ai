# BezotCorp AI architecture — Reading guide

[Documentation](../docs_index.md) · [Français](../fr/overview.md)

> This document is an **overview**, not the full [technical architecture documentation](architecture.md). That page provides the detailed description of the extension's current state in both languages.

## The VS Code extension

BezotCorp AI runs in VS Code with a conversation interface, AI model providers (including Ollama and a custom backend), tools for inspecting and modifying projects, bounded Git access and MCP tools.

The goal is to let an AI act on the project **while preserving security boundaries and user permissions**.

## Core responsibilities

- **Extension and interface:** manage conversations, messages, tool calls, generation interruption and display.
- **AI providers:** communicate with models and their services, keeping this transport separate from tool execution permissions.
- **File tools:** each low-level operation has one defined implementation; composed operations reuse it instead of creating another.
- **Permissions:** a central policy decides authorizations, confirmations and refusals; it also applies to operations originating from composed tools.
- **Persistence:** conversations, permission decisions and write recovery have distinct responsibilities.
- **Git:** bounded operations without arbitrary shell or unrestricted Git access.

## Reading and writing files

Reading an existing file goes through `read_file` and its access check. `read_files`, `search_text` and tools requiring file content must reuse this authorized read.

Before modification, the extension checks that disk content still matches what the AI consulted. Writes have backup, integrity checking and recovery mechanisms. A freshness check never grants access by itself.

Sensitive resources require fresh confirmation to read their content, even when other permissions have been remembered. Files may remain visible in listings without their content being readable.

## Conversations and permissions

Conversations can be created, renamed, archived, restored, trashed and deleted. Tool calls and their useful results are retained in history.

Permissions distinguish tools and resources, using `allow`, `ask` and `deny` rules. An explicit refusal cannot be bypassed by using another tool during the same generation. Critical operations always require appropriate confirmation.

## Standardizer indexing

The Standardizer indexing system is a separate architectural topic: its contract is documented in [Single entry point and indexes](indexing.md). The [Standardizer README](../../tools/rust/standardizer/README.md) describes the current Rust implementation, which must be assessed against that contract.

## What this page does not replace

The detailed architecture describes, in particular, exposed Git tools, autonomy modes, resource protection rules, path handling, MCP tools and current validation limits. To check a specific feature or security rule, consult the [full technical documentation](architecture.md).
