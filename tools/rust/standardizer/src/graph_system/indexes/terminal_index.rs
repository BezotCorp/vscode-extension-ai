use crate::{graph_system::IndexId, id_uuid_v7::IdUuidV7, tag_id::TagId};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    error::Error,
};

/// Physical index: references record files stored next to it as `<uuid>.ron`,
/// with the real tags of each file.
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TerminalIndex {
    id: IndexId,
    tags: BTreeSet<TagId>,
    entries: BTreeMap<IdUuidV7, BTreeSet<TagId>>,
}

impl TerminalIndex {
    pub(crate) fn new(id: IndexId) -> Self {
        Self {
            id,
            tags: BTreeSet::new(),
            entries: BTreeMap::new(),
        }
    }

    pub(crate) fn id(&self) -> IndexId {
        self.id
    }

    pub(crate) fn tags(&self) -> &BTreeSet<TagId> {
        &self.tags
    }

    pub(crate) fn entries(&self) -> &BTreeMap<IdUuidV7, BTreeSet<TagId>> {
        &self.entries
    }

    /// Aggregation derived from the referenced files' tags.
    pub(crate) fn aggregate(&self) -> BTreeSet<TagId> {
        self.entries.values().flatten().copied().collect()
    }

    pub(crate) fn add(
        &mut self,
        id: IdUuidV7,
        tags: BTreeSet<TagId>,
    ) -> Result<(), Box<dyn Error>> {
        if self.entries.insert(id, tags).is_some() {
            return Err(format!("record already indexed: {id}").into());
        }
        self.tags = self.aggregate();
        Ok(())
    }

    /// Refreshes the tags of an already indexed record.
    pub(crate) fn retag(
        &mut self,
        id: IdUuidV7,
        tags: BTreeSet<TagId>,
    ) -> Result<(), Box<dyn Error>> {
        let entry = self
            .entries
            .get_mut(&id)
            .ok_or_else(|| format!("record not indexed: {id}"))?;
        *entry = tags;
        self.tags = self.aggregate();
        Ok(())
    }
}
