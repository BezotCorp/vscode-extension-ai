use crate::{
    graph_system::{FileTypeNode, Indexable, IntentNode, NodeBase, OperationNode, ToolNode},
    id_uuid_v7::IdUuidV7,
    tag_id::TagId,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Deserialize, Serialize)]
pub(crate) enum Node {
    Intent(IntentNode),
    Operation(OperationNode),
    Tool(ToolNode),
    FileType(FileTypeNode),
}

impl Node {
    pub(crate) fn base(&self) -> &NodeBase {
        match self {
            Self::Intent(n) => n.base(),
            Self::Operation(n) => n.base(),
            Self::Tool(n) => n.base(),
            Self::FileType(n) => n.base(),
        }
    }

    pub(crate) fn set_tags(&mut self, tags: BTreeSet<TagId>) {
        match self {
            Self::Intent(n) => n.base_mut().set_tags(tags),
            Self::Operation(n) => n.base_mut().set_tags(tags),
            Self::Tool(n) => n.base_mut().set_tags(tags),
            Self::FileType(n) => n.base_mut().set_tags(tags),
        }
    }
}

impl Indexable for Node {
    fn id(&self) -> IdUuidV7 {
        self.base().id().id_uuid_v7()
    }
    fn tags(&self) -> &BTreeSet<TagId> {
        self.base().tags()
    }
    fn references(&self) -> BTreeSet<IdUuidV7> {
        BTreeSet::new()
    }
}
