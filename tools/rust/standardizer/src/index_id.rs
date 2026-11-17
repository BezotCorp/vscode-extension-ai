use crate::id_uuid_v7::IdUuidV7;
use serde::{Deserialize, Serialize};
use std::fmt;

/// Identity of an index, independent of where it is stored.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(transparent)]
pub(crate) struct IndexId(IdUuidV7);

impl IndexId {
    pub(crate) fn generate() -> Self {
        Self(IdUuidV7::generate())
    }
}

impl fmt::Display for IndexId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}
