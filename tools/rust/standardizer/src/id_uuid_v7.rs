use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::{Uuid, Version};

/// Identity of any persisted record: a UUIDv7 that also names its file.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(try_from = "Uuid", into = "Uuid")]
pub(crate) struct IdUuidV7(Uuid);

impl IdUuidV7 {
    pub(crate) fn generate() -> Self {
        Self(Uuid::now_v7())
    }

    pub(crate) fn uuid(self) -> Uuid {
        self.0
    }

    pub(crate) fn file_name(self) -> String {
        format!("{self}.ron")
    }
}

impl TryFrom<Uuid> for IdUuidV7 {
    type Error = &'static str;

    fn try_from(value: Uuid) -> Result<Self, Self::Error> {
        if value.get_version() != Some(Version::SortRand) {
            return Err("expected UUIDv7");
        }
        Ok(Self(value))
    }
}

impl From<IdUuidV7> for Uuid {
    fn from(value: IdUuidV7) -> Self {
        value.0
    }
}

impl fmt::Display for IdUuidV7 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}
