use crate::{criterion::Criterion, index::Index, index_id::IndexId};
use std::collections::BTreeSet;

/// One index participating in an orchestration, whether it already existed or
/// was created for the current operation.
pub(crate) struct OrchestratedIndex {
    id: IndexId,
    index: Index,
    registration: Option<BTreeSet<Criterion>>,
}

impl OrchestratedIndex {
    pub(crate) fn existing(id: IndexId, index: Index) -> Self {
        Self {
            id,
            index,
            registration: None,
        }
    }

    pub(crate) fn created(id: IndexId, index: Index, criteria: BTreeSet<Criterion>) -> Self {
        Self {
            id,
            index,
            registration: Some(criteria),
        }
    }

    pub(crate) fn id(&self) -> IndexId {
        self.id
    }

    pub(crate) fn index(&self) -> &Index {
        &self.index
    }

    pub(crate) fn index_mut(&mut self) -> &mut Index {
        &mut self.index
    }

    pub(crate) fn registration(&self) -> Option<&BTreeSet<Criterion>> {
        self.registration.as_ref()
    }
}
