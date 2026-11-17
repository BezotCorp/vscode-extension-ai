use crate::{
    id_index::IdIndex, index_id::IndexId, intermediate_index::IntermediateIndex,
    reference_index::ReferenceIndex, tag_id::TagId, terminal_index::TerminalIndex,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub(crate) const INDEX_FILE_NAME: &str = "index.ron";

/// Content of an `index.ron`: the file itself says which behavior it has.
/// `Intermediate` references indexes, `Terminal` references record files, the
/// categorical ones answer precise searches (by UUID, by referenced UUID).
#[derive(Deserialize, Serialize)]
pub(crate) enum Index {
    Intermediate(IntermediateIndex),
    Terminal(TerminalIndex),
    Id(IdIndex),
    Reference(ReferenceIndex),
}

impl Index {
    pub(crate) fn id(&self) -> IndexId {
        match self {
            Self::Intermediate(index) => index.id(),
            Self::Terminal(index) => index.id(),
            Self::Id(index) => index.id(),
            Self::Reference(index) => index.id(),
        }
    }

    /// Business tags aggregated under this index; categorical indexes carry none.
    pub(crate) fn tags(&self) -> BTreeSet<TagId> {
        match self {
            Self::Intermediate(index) => index.tags().clone(),
            Self::Terminal(index) => index.tags().clone(),
            Self::Id(_) | Self::Reference(_) => BTreeSet::new(),
        }
    }

    pub(crate) fn aggregate(&self) -> BTreeSet<TagId> {
        match self {
            Self::Intermediate(index) => index.aggregate(),
            Self::Terminal(index) => index.aggregate(),
            Self::Id(_) | Self::Reference(_) => BTreeSet::new(),
        }
    }
}
