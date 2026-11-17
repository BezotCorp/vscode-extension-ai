use crate::{
    graph_system::{EdgeId, Indexable, InterpretationBase},
    id_uuid_v7::IdUuidV7,
    tag_id::TagId,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// A durable reading of an edge. Its own tags (`interpretation` plus the ones
/// chosen to be kept) stay valid even when the linked nodes later lose them.
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Interpretation {
    base: InterpretationBase,
    edge: EdgeId,
}

impl Interpretation {
    pub(crate) fn new(base: InterpretationBase, edge: EdgeId) -> Self {
        Self { base, edge }
    }

    pub(crate) fn edge(&self) -> EdgeId {
        self.edge
    }
}

impl Indexable for Interpretation {
    fn id(&self) -> IdUuidV7 {
        self.base.id()
    }

    fn tags(&self) -> &BTreeSet<TagId> {
        self.base.tags()
    }

    fn references(&self) -> BTreeSet<IdUuidV7> {
        BTreeSet::from([self.edge.id_uuid_v7()])
    }
}
