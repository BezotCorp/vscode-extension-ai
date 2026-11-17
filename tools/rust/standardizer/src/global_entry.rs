use crate::{criterion::Criterion, location::Location};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// What the global index knows of one index: where it is and which searches it serves.
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct GlobalEntry {
    location: Location,
    criteria: BTreeSet<Criterion>,
}

impl GlobalEntry {
    pub(crate) fn new(location: Location, criteria: BTreeSet<Criterion>) -> Self {
        Self { location, criteria }
    }

    pub(crate) fn location(&self) -> &Location {
        &self.location
    }

    pub(crate) fn criteria(&self) -> &BTreeSet<Criterion> {
        &self.criteria
    }
}
