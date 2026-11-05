# BezotCorp AI — TODO

This document tracks only work that remains open.

## Runtime Validation

- Run the extension in the VS Code Extension Development Host.
- Validate conversation history containing tool calls and tool results.
- Validate every permission dialog and the permission manager.
- Validate protected-resource behavior.
- Validate critical-operation confirmation.
- Validate singular and plural filesystem tools.
- Validate Git tools, including fetch, pull and push with real credentials.
- Validate MCP lifecycle.
- Validate conversation reload.
- Validate archive, trash, restoration, permanent deletion and clearing of the active conversation.
- Validate multi-root filesystem behavior.

## File Update Validation

- Validate `update_file` in the Extension Development Host.
- Validate `node:sqlite` availability in the VS Code runtime.
- Force and verify a concurrent-content conflict.
- Force and verify interrupted-write recovery.
- Force and verify failed integrity restoration.

## Platform Validation

- Validate filesystem path handling on Windows.
- Validate Git behavior on Windows.
- Validate drive-letter and glob handling on Windows.

## Unsupported Workspace Types

- Add support for remote workspaces.
- Add support for virtual workspaces.

## Custom Backend

- Add tool support to the custom backend provider.

## Persistent Memory

Reference: [memory_ai_system.md](memory_ai_system.md).

- Implement the persistent memory subsystem in Rust.
- Implement the storage engine executable.
- Implement the symbolic consolidation engine executable.
- Implement the symbolic context-preparation engine executable.
- Implement durable storage with identities, temporal order and provenance.
- Implement conversation branches and revisions.
- Implement Restricted, Extended, Advanced and Universal memory levels.
- Implement incremental symbolic consolidation while preserving retained originals.
- Implement symbolic context preparation, retrieval and reinjection.
- Integrate memory capture with conversations, tools, MCP and permissions.
- Implement disk-budget and retention mechanisms.
- Implement memory consultation and configuration inside VS Code.

---

[← Back to the developer guide](../FOR_DEVELOPERS.md)
