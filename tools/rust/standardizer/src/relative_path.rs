use serde::{Deserialize, Serialize};
use std::{
    error::Error,
    ffi::OsStr,
    path::{Component, Path, PathBuf},
};

/// Non-empty path made only of normal components: it cannot escape the graph directory.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(try_from = "PathBuf", into = "PathBuf")]
pub(crate) struct RelativePath(PathBuf);

impl RelativePath {
    pub(crate) fn join(&self, segment: &str) -> Result<Self, Box<dyn Error>> {
        let mut components = Path::new(segment).components();
        if !matches!(
            (components.next(), components.next()),
            (Some(Component::Normal(_)), None)
        ) {
            return Err(format!("invalid path segment: {segment:?}").into());
        }
        Ok(Self(self.0.join(segment)))
    }

    pub(crate) fn parent(&self) -> Option<Self> {
        self.0
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .map(|parent| Self(parent.to_path_buf()))
    }

    pub(crate) fn file_name(&self) -> Option<&OsStr> {
        self.0.file_name()
    }

    pub(crate) fn depth(&self) -> usize {
        self.0.components().count()
    }

    pub(crate) fn as_path(&self) -> &Path {
        &self.0
    }
}

impl TryFrom<PathBuf> for RelativePath {
    type Error = String;

    fn try_from(value: PathBuf) -> Result<Self, Self::Error> {
        if value.as_os_str().is_empty()
            || value
                .components()
                .any(|part| !matches!(part, Component::Normal(_)))
        {
            return Err(format!("invalid relative path: {}", value.display()));
        }
        Ok(Self(value))
    }
}

impl From<RelativePath> for PathBuf {
    fn from(value: RelativePath) -> Self {
        value.0
    }
}
