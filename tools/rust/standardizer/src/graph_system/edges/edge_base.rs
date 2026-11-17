use crate::{graph_system::EdgeId, tag_id::TagId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct EdgeBase {
    id: EdgeId,
    tags: BTreeSet<TagId>,
}

impl EdgeBase {
    pub(crate) fn new(id: EdgeId, tags: BTreeSet<TagId>) -> Self {
        Self { id, tags }
    }

    pub(crate) fn id(&self) -> EdgeId {
        self.id
    }

    pub(crate) fn set_tags(&mut self, tags: BTreeSet<TagId>) {
        self.tags = tags;
    }

    pub(crate) fn tags(&self) -> &BTreeSet<TagId> {
        &self.tags
    }
}
