use crate::{global_index::GlobalIndex, location::Location};

/// Persistable index changes prepared by an index orchestration.
pub(crate) struct IndexChanges {
    indexes: Vec<(Location, Vec<u8>)>,
    global: GlobalIndex,
    global_bytes: Vec<u8>,
}

impl IndexChanges {
    pub(crate) fn new(
        indexes: Vec<(Location, Vec<u8>)>,
        global: GlobalIndex,
        global_bytes: Vec<u8>,
    ) -> Self {
        Self {
            indexes,
            global,
            global_bytes,
        }
    }

    pub(crate) fn indexes(&self) -> &[(Location, Vec<u8>)] {
        &self.indexes
    }

    pub(crate) fn global_bytes(&self) -> &[u8] {
        &self.global_bytes
    }

    pub(crate) fn into_global(self) -> GlobalIndex {
        self.global
    }
}
