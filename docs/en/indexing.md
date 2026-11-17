# Architecture — Single entry point for indexes

[Documentation](../docs_index.md) · [Français](../fr/indexing.md)

> **Status: architecture contract.** This document defines expected responsibilities and invariants independently of the Rust code's state. It does not automatically describe every behavior of the current implementation.
>
> **France Travail analogy:** the reception desk receives a request, identifies all competent services and directs it to them. It does not become the specialized service, the archives or the agent performing every operation.

## 1. Purpose

Retrieve relevant data **without unnecessarily opening other indexes or storage locations**, whether local or remote. Routing must remain extensible: adding a domain, index type, category or location must not require coding new domain-specific branches in the entry point.

The principle is:

```text
Request
  → query handling
    → GlobalIndex (entry point: select all relevant indexes)
      → selected indexes (execute their own search)
        → persisted data, only if needed
```

A **search** proceeds from the top to relevant indexes, then data. **Metadata maintenance** during creation or modification is a different process; it may propagate changes between levels without requiring reverse traversal during searches.

## 2. Clear responsibilities

| Responsibility                     | Contract                                                                                                                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Receiving / handling a query       | Understand the request, consult the entry point, use returned indexes and combine results without duplicates. Do not assume in advance that only one index is “the right one”.                                                           |
| `GlobalIndex` — single entry point | Register **all** existing indexes, physical and categorical; know their identity, location and the metadata needed to determine whether they can answer. Return **all** relevant matches without performing specialized searches itself. |
| Categorical indexes                | Answer a specific search form: UUID identity, reverse references, tags or another declared capability. They may be partitioned.                                                                                                          |
| Intermediate physical indexes      | Reference child indexes and their selection information to avoid opening irrelevant branches.                                                                                                                                            |
| Terminal physical indexes          | Reference physically stored records with metadata allowing files to be selected for opening.                                                                                                                                             |
| Write coordination                 | Consistently update data, affected indexes and their selection metadata.                                                                                                                                                                 |
| Storage                            | Read and write at a given location; do not decide which search strategy to use.                                                                                                                                                          |
| Consistency checking / recovery    | Verify and repair through explicitly defined mechanisms without turning every search into an exhaustive scan.                                                                                                                            |

A Rust structure may evolve to carry one of these responsibilities, but an existing name (`GraphStore`, `IndexOrchestrator`, etc.) does **not** define this contract. Check its actual calls and effects before renaming or moving it.

## 3. Identity, location, criteria and tags

- Every index has **its own stable `IndexId`**, independent of its `Location`. Changing location does not change identity.
- `Location` specifies where and through which storage to access the index; it is neither its identity nor its behavior.
- **Criteria / keywords** describe searches an index can answer: for example `node`, `uuid`, `edge`, `reference`, `physical` or a partition coordinate.
- **Data tags** actually describe records (`node`, `edge`, `rust`, `pending`, etc.). **A criterion is not a domain tag**, even when their labels are identical.
- Index references at levels where selection decisions are made must retain **the metadata useful for that decision**, including aggregate covered tags when a search filters by tags. This information must be available **before opening** the referenced index.

The entry point must be able to reject an index that cannot contain a requested result and retain all indexes that might. A filter may keep too many candidates, **never lose a valid candidate**. Criteria express a capability; aggregate tags express possible presence: their roles complement one another.

### Selection examples

- `node`: all indexes compatible with this search, without arbitrarily choosing a single hierarchy.
- `node + uuid`: categorical indexes compatible with node identity lookup.
- `edge + node`: indexes compatible with edge lookup from a node.
- Tags `node` and/or `rust`: consult only indexes whose declared coverage may provide results. The exact semantics of combined tags (all / at least one) belong to the query, rather than an entry-point assumption.
- `pending`: identify pending mutations through indexes and their metadata, **without scanning persisted data**.

More discriminating criteria narrow the selection. If several indexes remain compatible, the entry point returns them all. Execution must handle potential overlaps.

## 4. Categorical and physical indexes complement one another

Categorical indexes are not decorative copies of physical indexes.

- **By UUID:** the appropriate index directly indicates where to find the record.
- **By reverse reference:** find edges associated with a node through the dedicated index, **without traversing edges**.
- **By tags:** selection must eliminate indexes and branches without matches as early as possible; an inverted categorical tag index may provide more direct access without removing physical indexes' own metadata.
- **By physical location:** intermediate indexes navigate partitions; terminal indexes list actual files.

No categorical index must become a single worldwide file: it must support partitioning according to volume and storage constraints. The exact index chosen depends on actually declared capabilities, rather than a hardcoded domain name.

## 5. Aggregation and removal: an essential invariant

An aggregate tag on an index reference means: “**at least one covered record** carries this tag”.

It does **not** mean “all records carry it”.

For a terminal index, referenced files' tags provide the source for determining coverage. For an intermediate index, child coverage determines its own. References used to route a search must reflect actual coverage, up to the entry point's selection metadata when necessary.

**Removing a tag never means blindly erasing it from every aggregate.** Retain it while another covered record carries it. Conversely, once no covered record carries it, the aggregate must disappear from the affected references. This applies to physical indexes and maintained categorical capabilities.

Updates occur **during the write / mutation operation**, with transactional consistency and a recovery strategy. A later search uses already established metadata; it must not reconstruct the aggregate by exploring lower indexes.

## 6. Data model and propagation

- **Node:** carries its own tags.
- **Edge:** neutral relationship between **N nodes**, without mandatory source / target. Its tags are `edge` **plus the union of linked nodes' non-structural tags**.
- **Structural tags:** `node`, `edge`, `interpretation`, `mutation` and other tags declared structural never propagate between domains.
- **Interpretation:** a distinct object preserving durable meaning or context associated with reading an edge. **Do not erase semantic information on the grounds that it currently seems derivable from nodes**; precise modeling choices remain to be specified.
- **Mutation:** a persisted, identified (UUIDv7), indexed and partitionable intent. Its `pending` state makes unfinished work discoverable after interruption; `done` indicates completion.

### Example: removing `rust` from a node

1. Persist the `pending` mutation intent.
2. Modify node tags and update its indexes.
3. Query the reverse-reference categorical index to find **only** edges linked to the node.
4. For each affected edge, recompute the union of non-structural tags across **all** its nodes. If another node still carries `rust`, the edge retains `rust`.
5. Update indexes and their selection metadata; remove `rust` from an aggregate only if it is no longer represented.
6. Mark the mutation `done` only when the operation has reached its consistent state.

Recovery must be **idempotent**. It must not require every index to be perfectly consistent first when the purpose is precisely to repair an interruption.

## 7. Local, remote, partitioning and robustness

Routing must identify candidates **before** any unnecessary remote opening. Partitions must work with physical **and** categorical indexes. Index identity, queries and propagation rules must not depend exclusively on local paths.

An in-memory rollback does not establish a transactional guarantee: distinguish recoverable error, abrupt process termination and concurrent writes. Recovery must also protect consistency between records, categorical indexes, physical indexes and the entry point. Consistency validation may be explicit or progressive; it must not require opening every index by default at each ordinary load.

## 8. Acceptance criteria for any change

1. A query selects candidates through the entry point **without first opening every index**.
2. All compatible indexes are accessible; no valid result is lost, even with partitioning or overlap.
3. UUID, reverse-reference and tag searches use paths suited to their search form, without scanning data when specialized indexes exist.
4. Adding, removing or moving data correctly maintains references and aggregates; **removal of the last carrier** and **removal of one carrier among several** are covered.
5. Node → edge operations use reverse references and preserve tags still present on other nodes.
6. Interpretation information remains durable and is not implicitly eliminated during migration.
7. An interrupted mutation is discoverable and resumable; partial-failure cases are covered by retained automated tests.
8. Migrations preserve existing data and verify invariants before and after, without unnecessary writes.

## 9. Relationship to the current implementation

This contract **does not automatically validate** existing classes. In `standardizer`, `GlobalIndex` currently references identities, locations and criteria; `GraphStore` mixes storage access and search strategies; `IndexOrchestrator` coordinates index modifications; `IdIndex` and `ReferenceIndex` exist; tag searches currently traverse the physical hierarchy.

These observations serve to **audit gaps**, rather than mandate wholesale renaming or rewriting. Any alignment must start with behavioral tests and preserve RON data; a format change requires a verified migration.

Additional reference: the [Standardizer README](../../tools/rust/standardizer/README.md), which describes current formats and behavior.
