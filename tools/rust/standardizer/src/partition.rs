use crate::{creation_date::CreationDate, criterion::Criterion, id_uuid_v7::IdUuidV7};
use serde::{Deserialize, Serialize};
use std::error::Error;

/// How records (and lookup entries) are spread under a root. Each strategy yields
/// the folder names, in order, between the root and the leaf index.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub(crate) enum Partition {
    /// UTC creation date of the UUIDv7: `year/month/day`.
    CreationDate,
}

impl Partition {
    pub(crate) fn segments(self, key: IdUuidV7) -> Result<Vec<String>, Box<dyn Error>> {
        match self {
            Self::CreationDate => Ok(CreationDate::from_id(key)?.segments()),
        }
    }

    /// Criterion locating the shard reached after these segments (`2026-11-16`).
    pub(crate) fn coordinate(segments: &[String]) -> Result<Criterion, Box<dyn Error>> {
        Ok(Criterion::try_from(segments.join("-"))?)
    }
}
