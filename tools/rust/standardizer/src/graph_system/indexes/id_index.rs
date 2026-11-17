use crate::{graph_system::IndexId, id_uuid_v7::IdUuidV7, location::Location};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, error::Error};

/// Categorical index answering "where is the record with this UUID".
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct IdIndex {
    id: IndexId,
    entries: BTreeMap<IdUuidV7, Location>,
}

impl IdIndex {
    pub(crate) fn new(id: IndexId) -> Self {
        Self {
            id,
            entries: BTreeMap::new(),
        }
    }

    pub(crate) fn id(&self) -> IndexId {
        self.id
    }

    pub(crate) fn entries(&self) -> &BTreeMap<IdUuidV7, Location> {
        &self.entries
    }

    pub(crate) fn add(
        &mut self,
        record: IdUuidV7,
        location: Location,
    ) -> Result<(), Box<dyn Error>> {
        if self.entries.insert(record, location).is_some() {
            return Err(format!("record already in the id index: {record}").into());
        }
        Ok(())
    }
}
