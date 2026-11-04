# BezotCorp AI — TODO

This document tracks identified work that remains to be implemented or corrected. It contains no speculative features or invented priorities.

## Existing Implementation

| Status | Work                                                                                                                                                                                                                                                                                                       | Existing source                                                           | Identified reason                                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Open   | Run the extension and check by hand: history with tool turns, every permission dialog and the manager, protected resources, `update_file` (both forms), the plural file tools, git tools (including fetch, pull and push with real credentials), MCP lifecycle, reload of a conversation, multi-root paths | `src/tools/`, `src/permissions/`, `src/mcp/`                              | The code compiles and its pure parts were exercised outside the repository; nothing has run in an Extension Development Host                  |
| Open   | Check `update_file` in the extension host: `node:sqlite` availability in the VS Code runtime, a forced conflict, a resumed interrupted write, a failed integrity check                                                                                                                                     | `src/tools/local/filesystem/write_file_pipeline.ts`, `src/state_machine/` | Compiled and the state machine exercised on its own; the pipeline has never run, and a runtime without `node:sqlite` makes `update_file` fail |
| Open   | Close the permission dialog when generation is stopped                                                                                                                                                                                                                                                     | `src/tools/tool_access_guard.ts`                                          | The VS Code API cannot close a modal dialog; after Stop it stays on screen and its answer is ignored                                          |
| Open   | Validate path handling and git on Windows                                                                                                                                                                                                                                                                  | `src/workspace/`, `src/permissions/`, `src/tools/local/git/`              | Globs, drive letters and process termination are written for it but untested                                                                  |
| Open   | Support remote and virtual workspaces                                                                                                                                                                                                                                                                      | `src/tools/local/filesystem/create_file_tool.ts`, `src/tools/local/git/`  | Some tools use the Node filesystem directly, and git runs on the local machine                                                                |
| Open   | Add tool support to the custom backend provider                                                                                                                                                                                                                                                            | `src/providers/custom_backend_provider.ts`                                | It receives the history but exposes no tools                                                                                                  |

## Persistent Memory

**Reference:** `docs/memory_ai_system.md`, together with the architectural decisions already established for the Rust implementation.

| Status | Defined work                                                                     |
| ------ | -------------------------------------------------------------------------------- |
| Open   | Implement the persistent memory subsystem in Rust                                |
| Open   | Implement the three distinct Rust executables specified below                    |
| Open   | Implement durable storage with object identities, temporal order and provenance  |
| Open   | Implement conversation branches and revisions                                    |
| Open   | Implement the four memory levels: Restricted, Extended, Advanced and Universal   |
| Open   | Implement incremental symbolic consolidation while preserving retained originals |
| Open   | Implement symbolic context preparation, retrieval and reinjection                |
| Open   | Integrate memory capture with conversations, tools, MCP and permissions          |
| Open   | Implement the defined disk-budget and retention mechanisms                       |
| Open   | Implement memory consultation and configuration within VS Code                   |

### Defined Rust Executables

| Executable                          | Responsibility                                              |
| ----------------------------------- | ----------------------------------------------------------- |
| Storage engine                      | Durable memory storage and access                           |
| Symbolic consolidation engine       | Consolidation and enrichment of existing knowledge          |
| Symbolic context-preparation engine | Preparation and retrieval of context for model interactions |

These are three distinct executable binaries, not merely three libraries. This separation does not require three permanently running processes.

## Tracking

The TODO records already defined requirements and defects established in existing implementations. New features and architectural decisions are not added without an explicit decision.

Completed work is documented in a subsequent dated working-point file.
