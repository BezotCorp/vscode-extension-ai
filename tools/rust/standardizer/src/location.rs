use crate::relative_path::RelativePath;
use serde::{Deserialize, Serialize};
use std::{
    error::Error,
    ffi::OsStr,
    fmt,
    path::{Path, PathBuf},
};

/// Where a persisted item lives. Only the local storage exists today; other
/// storages (servers) are added as variants without touching index logic.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum Location {
    /// Relative to the graph directory.
    Local(RelativePath),
}

impl Location {
    pub(crate) fn join(&self, segment: &str) -> Result<Self, Box<dyn Error>> {
        match self {
            Self::Local(path) => Ok(Self::Local(path.join(segment)?)),
        }
    }

    /// Location of the folder containing this item.
    pub(crate) fn directory(&self) -> Option<Self> {
        match self {
            Self::Local(path) => path.parent().map(Self::Local),
        }
    }

    pub(crate) fn depth(&self) -> usize {
        match self {
            Self::Local(path) => path.depth(),
        }
    }

    pub(crate) fn file_name(&self) -> Option<&OsStr> {
        match self {
            Self::Local(path) => path.file_name(),
        }
    }

    pub(crate) fn resolve(&self, base: &Path) -> PathBuf {
        match self {
            Self::Local(path) => base.join(path.as_path()),
        }
    }
}

impl fmt::Display for Location {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Local(path) => write!(formatter, "local:{}", path.as_path().display()),
        }
    }
}
