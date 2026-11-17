use crate::{graph_system::NodeId, tag_id::TagId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct NodeBase {
    id: NodeId,
    tags: BTreeSet<TagId>,
}

impl NodeBase {
    pub(crate) fn new(id: NodeId, tags: BTreeSet<TagId>) -> Self {
        Self { id, tags }
    }

    pub(crate) fn id(&self) -> NodeId {
        self.id
    }

    pub(crate) fn set_tags(&mut self, tags: BTreeSet<TagId>) {
        self.tags = tags;
    }

    pub(crate) fn tags(&self) -> &BTreeSet<TagId> {
        &self.tags
    }
}
