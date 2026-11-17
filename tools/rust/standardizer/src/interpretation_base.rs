use crate::{id_uuid_v7::IdUuidV7, tag_id::TagId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct InterpretationBase {
    id: IdUuidV7,
    tags: BTreeSet<TagId>,
}

impl InterpretationBase {
    pub(crate) fn new(id: IdUuidV7, tags: BTreeSet<TagId>) -> Self {
        Self { id, tags }
    }

    pub(crate) fn id(&self) -> IdUuidV7 {
        self.id
    }

    pub(crate) fn tags(&self) -> &BTreeSet<TagId> {
        &self.tags
    }
}
