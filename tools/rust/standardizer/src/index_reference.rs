use crate::{location::Location, tag_id::TagId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// A child index as seen by its parent: location and aggregated tags.
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct IndexReference {
    location: Location,
    tags: BTreeSet<TagId>,
}

impl IndexReference {
    pub(crate) fn new(location: Location, tags: BTreeSet<TagId>) -> Self {
        Self { location, tags }
    }

    pub(crate) fn location(&self) -> &Location {
        &self.location
    }

    pub(crate) fn tags(&self) -> &BTreeSet<TagId> {
        &self.tags
    }
}
