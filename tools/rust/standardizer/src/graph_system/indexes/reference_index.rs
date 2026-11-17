use crate::{graph_system::IndexId, id_uuid_v7::IdUuidV7, location::Location};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Categorical index answering "which records reference this UUID".
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReferenceIndex {
    id: IndexId,
    entries: BTreeMap<IdUuidV7, BTreeMap<IdUuidV7, Location>>,
}

impl ReferenceIndex {
    pub(crate) fn new(id: IndexId) -> Self {
        Self {
            id,
            entries: BTreeMap::new(),
        }
    }

    pub(crate) fn id(&self) -> IndexId {
        self.id
    }

    pub(crate) fn entries(&self) -> &BTreeMap<IdUuidV7, BTreeMap<IdUuidV7, Location>> {
        &self.entries
    }

    pub(crate) fn add(&mut self, referenced: IdUuidV7, referrer: IdUuidV7, location: Location) {
        self.entries
            .entry(referenced)
            .or_default()
            .insert(referrer, location);
    }
}
