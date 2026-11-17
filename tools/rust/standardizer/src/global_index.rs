use crate::{
    criterion::Criterion, global_entry::GlobalEntry, index_id::IndexId, location::Location,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// Single entry point to every persisted index, whatever its role. It only says
/// which indexes exist, where, and for which searches; it never picks one.
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct GlobalIndex {
    indexes: BTreeMap<IndexId, GlobalEntry>,
}

impl GlobalIndex {
    pub(crate) fn iter(&self) -> impl Iterator<Item = (IndexId, &GlobalEntry)> {
        self.indexes.iter().map(|(id, entry)| (*id, entry))
    }

    pub(crate) fn get(&self, id: IndexId) -> Option<&GlobalEntry> {
        self.indexes.get(&id)
    }

    /// Every index declaring all the requested criteria: more criteria, narrower result.
    pub(crate) fn find(&self, query: &BTreeSet<Criterion>) -> Vec<(IndexId, &GlobalEntry)> {
        self.iter()
            .filter(|(_, entry)| query.is_subset(entry.criteria()))
            .collect()
    }

    pub(crate) fn id_at(&self, location: &Location) -> Option<IndexId> {
        self.iter()
            .find(|(_, entry)| entry.location() == location)
            .map(|(id, _)| id)
    }

    pub(crate) fn register(&mut self, id: IndexId, entry: GlobalEntry) {
        self.indexes.insert(id, entry);
    }
}
