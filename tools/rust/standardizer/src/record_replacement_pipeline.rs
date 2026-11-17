use crate::{
    data_placement::{DataPlacementOrchestrator, RecordFile},
    graph_system::{Index, IndexOrchestrator, Indexable, TerminalIndex},
    location::Location,
};
use std::error::Error;

/// Rewrite of an existing record after its tags changed: re-routing check,
/// retagging in its physical leaf, aggregation above it, then persistence.
pub(crate) struct RecordReplacementPipeline;

impl RecordReplacementPipeline {
    /// Rewrites an existing record after its tags changed and refreshes the
    /// aggregated tags of every index above it. References must not change.
    pub(crate) fn run<R: Indexable>(
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
