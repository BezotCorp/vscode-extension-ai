use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

pub(crate) struct TrackedFile {
    path: PathBuf,
    blob: OsString,
}

impl TrackedFile {
    pub(crate) fn new(path: PathBuf, blob: OsString) -> Self {
        Self { path, blob }
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn blob(&self) -> &OsString {
        &self.blob
    }
}
