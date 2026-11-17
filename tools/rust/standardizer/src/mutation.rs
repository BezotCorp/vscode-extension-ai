use crate::{
    graph_system::Indexable, id_uuid_v7::IdUuidV7, mutation_base::MutationBase,
    mutation_operation::MutationOperation, tag_id::TagId,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Persisted intent to change data, written before touching anything. Its tags
/// tell whether it is still to be done (`pending`) or finished (`done`).
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Mutation {
    base: MutationBase,
    operation: MutationOperation,
}

impl Mutation {
    pub(crate) fn new(base: MutationBase, operation: MutationOperation) -> Self {
        Self { base, operation }
    }

    pub(crate) fn operation(&self) -> MutationOperation {
        self.operation
    }

    pub(crate) fn set_tags(&mut self, tags: BTreeSet<TagId>) {
        self.base.set_tags(tags);
    }
}

impl Indexable for Mutation {
    fn id(&self) -> IdUuidV7 {
        self.base.id()
    }

    fn tags(&self) -> &BTreeSet<TagId> {
        self.base.tags()
    }

    fn references(&self) -> BTreeSet<IdUuidV7> {
        BTreeSet::new()
    }
}
