use crate::{
    data_placement::{DataPlacementOrchestrator, RecordFile},
    graph_system::{IdIndex, Index, IndexOrchestrator, Indexable, ReferenceIndex, TerminalIndex},
    id_uuid_v7::IdUuidV7,
    location::Location,
    lookup_kind::LookupKind,
    tag_id::TagId,
};
use std::{collections::BTreeSet, error::Error};

/// Creates or retags records and keeps every index consistent, for any domain.
pub(crate) struct RecordWriter;

impl RecordWriter {
    /// Creates a record tagged with `domain` plus `tags`, written where the write
    /// configuration routes those tags. Either the record is reachable through
    /// its physical indexes, its categorical indexes and the global index, or
    /// nothing changed.
    pub(crate) fn add<R: Indexable>(
        store: &mut DataPlacementOrchestrator,
        domain: &TagId,
        tags: BTreeSet<TagId>,
        build: impl FnOnce(IdUuidV7, BTreeSet<TagId>) -> R,
    ) -> Result<IdUuidV7, Box<dyn Error>> {
        store.require_initialized()?;
        let id = IdUuidV7::generate();
        let mut tags = tags;
        tags.insert(*domain);
        if tags.iter().any(|tag| !store.tags().contains(tag)) {
            return Err("unregistered tag reference".into());
        }
        let record = build(id, tags.clone());
        if record.id() != id || *record.tags() != tags {
            return Err("created record does not carry the assigned identity and tags".into());
        }
        let destination = store.destinations().select(&tags)?;
        let mut workspace = IndexOrchestrator::new(store);

        let segments = destination.partition().segments(id)?;
        let leaf = workspace.open(
            destination.root(),
            &segments,
            destination.criteria(),
            &|index| Index::Terminal(TerminalIndex::new(index)),
        )?;
        let record_location = leaf
            .directory()
            .ok_or("index without folder")?
            .join(&id.file_name())?;
        match workspace.index_mut(&leaf)? {
            Index::Terminal(terminal) => terminal.add(id, tags)?,
            _ => return Err("physical leaf is not a terminal index".into()),
        }

        for lookup in destination.lookups() {
            match lookup.kind() {
                LookupKind::Id => {
                    let leaf =
                        workspace.open(lookup.root(), &segments, lookup.criteria(), &|index| {
                            Index::Id(IdIndex::new(index))
                        })?;
                    match workspace.index_mut(&leaf)? {
                        Index::Id(index) => index.add(id, record_location.clone())?,
                        _ => return Err("lookup leaf is not an id index".into()),
                    }
                }
                LookupKind::Reference => {
                    for referenced in record.references() {
                        let keyed = destination.partition().segments(referenced)?;
                        let leaf =
                            workspace.open(lookup.root(), &keyed, lookup.criteria(), &|index| {
                                Index::Reference(ReferenceIndex::new(index))
                            })?;
                        match workspace.index_mut(&leaf)? {
                            Index::Reference(index) => {
                                index.add(referenced, id, record_location.clone());
                            }
                            _ => return Err("lookup leaf is not a reference index".into()),
                        }
                    }
                }
            }
        }
        let changes = workspace.finish()?;
        let (indexes, global) = changes.into_parts();
        store.persist(
            RecordFile::create(record_location, &record),
            &indexes,
            global,
        )?;
        Ok(id)
    }

    /// Rewrites an existing record after its tags changed and refreshes the
    /// aggregated tags of every index above it. References must not change.
    pub(crate) fn replace<R: Indexable>(
        store: &mut DataPlacementOrchestrator,
        record: &R,
        location: &Location,
    ) -> Result<(), Box<dyn Error>> {
        store.require_initialized()?;
        let destination = store.destinations().select(record.tags())?;
        let mut workspace = IndexOrchestrator::new(store);
        let segments = destination.partition().segments(record.id())?;
        let leaf = workspace.open(
            destination.root(),
            &segments,
            destination.criteria(),
            &|index| Index::Terminal(TerminalIndex::new(index)),
        )?;
        if leaf.directory() != location.directory() {
            return Err("record is not stored where its identity routes it".into());
        }
        match workspace.index_mut(&leaf)? {
            Index::Terminal(terminal) => terminal.retag(record.id(), record.tags().clone())?,
            _ => return Err("physical leaf is not a terminal index".into()),
        }
        let changes = workspace.finish()?;
        let (indexes, global) = changes.into_parts();
        store.persist(
            RecordFile::replace(location.clone(), record),
            &indexes,
            global,
        )
    }
}
