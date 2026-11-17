use crate::{index_id::IndexId, index_reference::IndexReference, tag_id::TagId};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// Index that references other indexes.
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct IntermediateIndex {
    id: IndexId,
    tags: BTreeSet<TagId>,
    children: BTreeMap<IndexId, IndexReference>,
}

impl IntermediateIndex {
    pub(crate) fn new(id: IndexId) -> Self {
        Self {
            id,
            tags: BTreeSet::new(),
            children: BTreeMap::new(),
        }
    }

    pub(crate) fn id(&self) -> IndexId {
        self.id
    }

    pub(crate) fn tags(&self) -> &BTreeSet<TagId> {
        &self.tags
    }

    pub(crate) fn children(&self) -> &BTreeMap<IndexId, IndexReference> {
        &self.children
    }

    /// Aggregation derived from the children.
    pub(crate) fn aggregate(&self) -> BTreeSet<TagId> {
        self.children
            .values()
            .flat_map(|child| child.tags().iter().copied())
            .collect()
    }

    /// Records or refreshes a child and re-derives the aggregated tags.
    pub(crate) fn reference(&mut self, child: IndexId, reference: IndexReference) {
        self.children.insert(child, reference);
        self.tags = self.aggregate();
    }
}
