use crate::{
    graph_system::{GlobalIndex, Index},
    location::Location,
};

/// Index changes prepared by an index orchestration, ready to be handed to
/// the data placement for persistence.
pub(crate) struct IndexChanges {
    indexes: Vec<(Location, Index)>,
    global: GlobalIndex,
}

impl IndexChanges {
    pub(crate) fn new(indexes: Vec<(Location, Index)>, global: GlobalIndex) -> Self {
        Self { indexes, global }
    }

    pub(crate) fn into_parts(self) -> (Vec<(Location, Index)>, GlobalIndex) {
        (self.indexes, self.global)
    }
}
