use crate::{criterion::Criterion, location::Location, lookup_kind::LookupKind};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// A categorical index maintained for every record created at a destination.
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct LookupDestination {
    kind: LookupKind,
    root: Location,
    criteria: BTreeSet<Criterion>,
}

impl LookupDestination {
    pub(crate) fn kind(&self) -> LookupKind {
        self.kind
    }

    pub(crate) fn root(&self) -> &Location {
        &self.root
    }

    pub(crate) fn criteria(&self) -> &BTreeSet<Criterion> {
        &self.criteria
    }
}
