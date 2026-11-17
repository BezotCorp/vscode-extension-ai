# Standardizer routing graph

Graph data lives under `data/standardizer/`. Fixed, functionally named files:
`global_index.ron`, `tag_registry.ron` and `write_locations.ron`. There is no bootstrap file.

## Tags, criteria and indexes

Tags carry the meaning and are the routing entry point. Every created object gets its
structural tag automatically (`node`, `edge`, `interpretation`, `mutation`) plus the tags given
by the caller. Structural tags are the `tag` of each destination in `write_locations.ron`; they
never propagate from one object to another. Names exist only in the registry.

`GlobalIndex` is the single entry point to every index. For each index it knows its own `IndexId`
(UUIDv7, independent of the location), its `Location` and its **criteria**: keywords that steer a
search (`node`, `uuid`, `edge`, `reference`, `physical`, `tag`, a partition coordinate such as
`2026-11-16`). Criteria are not business tags. `find(criteria)` returns every index declaring all of
them, never choosing one. Adding a domain does not change this type.

Every index file says which behavior it has (`Index` enum) and carries its own `id`:

- `IntermediateIndex`: references child indexes (id, location, aggregated tags);
- `TerminalIndex`: references the record files `<uuid>.ron` stored next to it, with their real tags;
- `IdIndex`: categorical, UUID -> record file;
- `ReferenceIndex`: categorical, referenced UUID -> records referencing it (e.g. edges of a node).

Physical indexes aggregate tags upward (terminal = union of its files, intermediate = union of its
children): a tag in an index means at least one record below carries it. Searching by tag goes
through the global index to the physical hierarchy, then prunes the descent with those tags.
Categorical indexes are partitioned like the data (`CreationDate` of the key: `year/month/day`).
The partition is carried by paths and indexes, not by Rust types.

`write_locations.ron` (where new data is created, by tag, with the lookups to maintain) is distinct
from `global_index.ron` (where existing indexes are). Locations are the `Location` enum (local only).

## Model

- node: carries its tags;
- edge: neutral link between any number of nodes, tagged `edge` plus the non-structural tags of
  its nodes. It has no direction and no meaning;
- interpretation: references an edge and keeps durable tags (`interpretation` plus chosen ones);
  its meaning is not modeled yet;
- mutation: persisted intent (`AddNodeTag`/`RemoveNodeTag`), tagged `pending` then `done`.

Routing reads roles from the tags of the nodes an edge links (intent/operation/tool/file-type);
it does not use interpretations.

## Transactions

Creating a record (`RecordWriter::add`) or retagging one (`RecordWriter::replace`) is one
transaction: file, terminal and categorical indexes, parent indexes, then the global index (commit
point). On failure the changes are reverted. A mutation is written first, then applied step by step
(node, edges found through the reference index, indexes, aggregates) and marked `done`; steps are
idempotent so `RoutingWriter::resume_pending` can finish a crashed one, found through the `pending`
tag without scanning the storage. Loading verifies the declared indexes but never scans for
unreferenced files.

## Documentation

Start with the [documentation index — English / Français](../../../docs/docs_index.md).

The Standardizer index architecture contract is available in [English](../../../docs/en/indexing.md) and [French](../../../docs/fr/indexing.md). It defines expected indexing responsibilities; this README describes the current Rust layout and RON formats.

## Initialization

A store is brought to the initialized state only by `standardizer init <directory> <tag_registry.ron> <write_locations.ron>`
(virgin location) or `standardizer adopt` (existing system, once). Both create the empty witness `data/standardizer/.lock`
last, from the store's own files only (no Git, no network). Versioning `.lock` is left to the user.
See `docs/en/indexing.md` section 10.

