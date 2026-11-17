use crate::{
    criterion::Criterion, location::Location, lookup_destination::LookupDestination,
    partition::Partition, tag_id::TagId,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Where new data carrying `tag` is created, and which indexes follow it.
/// `tag` is the structural tag of the domain: it is never propagated.
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct WriteDestination {
    tag: TagId,
    root: Location,
    partition: Partition,
    criteria: BTreeSet<Criterion>,
    lookups: Vec<LookupDestination>,
}

impl WriteDestination {
    pub(crate) fn tag(&self) -> &TagId {
        &self.tag
    }

    /// Folder holding the root of the physical index hierarchy.
    pub(crate) fn root(&self) -> &Location {
        &self.root
    }

    pub(crate) fn partition(&self) -> Partition {
        self.partition
    }

    /// Criteria of the physical indexes created for this destination.
    pub(crate) fn criteria(&self) -> &BTreeSet<Criterion> {
        &self.criteria
    }

    pub(crate) fn lookups(&self) -> &[LookupDestination] {
        &self.lookups
    }
}
