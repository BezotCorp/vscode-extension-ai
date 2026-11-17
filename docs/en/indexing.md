# Index architecture — Single entry point

> **Status: architecture contract, not a certification of the current Rust implementation.**
>
> **France Travail analogy:** a single reception desk identifies the services capable of handling a request. It neither performs the specialized work nor searches every archive to discover which service to contact.

## Purpose and request flow

The goal is to retrieve relevant records without opening unrelated indexes or storage locations, whether local or remote. A new domain, index type, or location must not require adding business-specific branches to the global entry point.

```text
Request → query handling → GlobalIndex (routing) → matching indexes (execution) → records if needed
```

A **query** starts at the top. **Index maintenance** during writes is separate: it may update metadata at several levels, but a query must not have to reconstruct summaries by walking upward from records.

## Responsibilities

| Role | Responsibility |
| --- | --- |
| Query handling | Receives search parameters, asks the global entry point for candidates, executes the selected index capabilities and assembles results without duplicates. |
| `GlobalIndex` | Registers **every** physical and categorical index, knows its identity, location, search capabilities and metadata needed to eliminate impossible candidates. Returns **all** relevant candidates; does not execute their specialized searches. |
| Categorical indexes | Resolve precise lookups: UUID, reverse references, tags, or other declared capabilities; can be partitioned. |
| Intermediate physical indexes | Reference child indexes with enough metadata to skip irrelevant subtrees before opening them. |
| Terminal physical indexes | Reference persisted record files with the metadata needed to select files. |
| Write coordination | Keeps records, specialized indexes, aggregates, and global routing metadata coherent as one managed change. |
| Storage | Reads and writes at an identified location without deciding which search strategy to use. |
| Verification and recovery | Check and recover consistency without making ordinary searches eagerly scan all indexes. |

Current Rust names such as `GraphStore` or `IndexOrchestrator` do not define these architectural responsibilities. Verify their actual use before choosing to reuse, rename, or split them.

## Identity, criteria and tags

Every index owns a stable `IndexId` (UUIDv7), **independent of its `Location`**. `Location` describes how and where it is accessed, not its identity or search behavior.

**Criteria** are search capability keywords (for example `node`, `uuid`, `edge`, `reference`, `physical` or a partition coordinate). **Record tags** describe the underlying records (`node`, `edge`, `rust`, `pending`, etc.). Even identical spellings do not make these the same concept.

References to indexes must carry the metadata needed at their decision level, including **aggregated tags** where tags filter a search. This information must be available **before** the referenced index is opened.

Capability criteria say what an index can answer; aggregate tags say what its covered records may contain. Filtering must never discard a valid candidate. If multiple indexes match, return them all, with deduplication performed as needed by query execution.

Examples:
- `node` → every index capable of answering that search.
- `node + uuid` → compatible node UUID lookup indexes.
- `edge + node` → indexes supporting edge lookup from a referenced node.
- `pending` → locate incomplete mutations through indexed metadata, not by scanning record storage.
- Tag-based queries such as `rust` → skip any index whose known coverage makes a match impossible. Whether a multi-tag query means ALL or ANY must be explicit in the query contract.

More discriminating criteria narrow the candidates; the global index never arbitrarily chooses one.

## Why both categorical and physical indexes exist

- **UUID:** find a record via its categorical lookup, without scanning record files.
- **Reverse reference:** find edges containing a node via the reference index, not by reading every edge.
- **Tags:** filter at the highest available level, then use appropriate categorical or physical indexes; a dedicated inverted tag index can provide a more direct route.
- **Physical organization:** intermediate indexes navigate partitions and terminal indexes list actual files.

Categorical indexes must be partitionable too; no universal monolithic file is required. Physical indexes remain useful: the presence of categorical indexes does not make them redundant.

## Aggregate tags and removal correctness

An aggregate tag means **at least one** covered record has that tag, not all of them.

A terminal index determines coverage from its referenced record entries; an intermediate index from child coverage. References used for routing—including the global entry where relevant—must be kept consistent with that coverage.

Removing a tag from one record must **not** blindly remove it from every aggregate: retain it while another covered record still has it. Remove it from the corresponding aggregates only after the **last** covered record loses it. The same consistency rule applies to maintained categorical lookup capabilities.

Aggregates are updated **during a write/mutation**. Subsequent queries use the already persisted metadata and must not reconstruct it by reading lower layers.

## Data semantics

- **Node:** owns its tags.
- **Edge:** neutral link across **N nodes**, no mandatory source/target; carries `edge` plus the union of linked nodes' non-structural tags.
- **Structural tags** (`node`, `edge`, `interpretation`, `mutation`, and any other configured structural domain tags) never propagate between objects.
- **Interpretation:** a separate persisted object preserving durable contextual meaning for an edge. Do **not** discard existing meaning on the unsupported assumption that it can always be derived from node types; the precise new model needs explicit specification.
- **Mutation:** a UUIDv7-identified, persisted and indexed intent, marked `pending` until completion, then `done`; partitioning must remain possible.

### Removing `rust` from a node

1. Persist a `pending` mutation intent.
2. Update the node and affected indexes.
3. Use the reverse-reference categorical index to find **only** the edges containing this node.
4. Recompute each edge's non-structural tag union across **all** of its nodes. Another node still carrying `rust` keeps the tag on the edge.
5. Maintain all affected index entries and aggregate metadata; remove `rust` from a coverage summary only when there is no remaining carrier.
6. Mark the mutation `done` once the required state is coherent.

Recovery must be idempotent and must not require every index to be perfectly consistent before repair can start.

## Partitioning, remoteness and reliability

Routing should reject irrelevant candidates before opening remote storage. Both physical and categorical indexes need partitioning support. Index identity and query semantics must not rely on local filesystem paths.

An in-memory rollback does **not** establish crash safety. Distinguish recoverable errors, abrupt process termination and concurrent writes. Protect consistency across records, categorical indexes, physical indexes and the global index. Ordinary loading should not require opening every registered index.

## Acceptance criteria

1. Start every search with global candidate selection, without opening all indexes.
2. Preserve all valid matches despite overlaps and partitioning.
3. Provide appropriate lookup paths for UUID, reverse references and tags.
4. Test additions, moves and removals, including removal of the **last** carrier and removal of one carrier among several.
5. Propagate node changes via reverse edge references; preserve tags still carried by other nodes.
6. Preserve durable interpretation meaning across migrations.
7. Persist and resume interrupted mutations; retain automated regression tests for partial failures.
8. Migrate existing RON data explicitly and verify invariants before and after.

## Current implementation is not the contract

At the time of writing, `GlobalIndex` records index IDs, locations and criteria; `GraphStore` combines storage and search strategies; `IndexOrchestrator` coordinates index writes; `IdIndex` and `ReferenceIndex` exist; tag searches navigate the physical hierarchy. These observations identify potential **gaps to audit**, not a mandate to rewrite or rename everything.

For current storage formats and behavior, see the [Standardizer README](../../tools/rust/standardizer/README.md). The [French architecture contract](../fr/indexing.md) covers the same design principles with additional explanation.
