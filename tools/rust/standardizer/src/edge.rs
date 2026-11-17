use crate::{
    edge_base::EdgeBase, id_uuid_v7::IdUuidV7, indexable::Indexable, node_id::NodeId, tag_id::TagId,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Neutral link between any number of nodes. It carries no meaning: its tags are
/// `edge` plus the non-structural tags of the nodes it links.
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Edge {
    base: EdgeBase,
    nodes: BTreeSet<NodeId>,
}

impl Edge {
    pub(crate) fn new(base: EdgeBase, nodes: BTreeSet<NodeId>) -> Self {
        Self { base, nodes }
    }

    pub(crate) fn base(&self) -> &EdgeBase {
        &self.base
    }

    pub(crate) fn nodes(&self) -> &BTreeSet<NodeId> {
        &self.nodes
    }

    pub(crate) fn set_tags(&mut self, tags: BTreeSet<TagId>) {
        self.base.set_tags(tags);
    }
}

impl Indexable for Edge {
    fn id(&self) -> IdUuidV7 {
        self.base.id().id_uuid_v7()
    }

    fn tags(&self) -> &BTreeSet<TagId> {
        self.base.tags()
    }

    fn references(&self) -> BTreeSet<IdUuidV7> {
        self.nodes.iter().map(|node| node.id_uuid_v7()).collect()
    }
}
