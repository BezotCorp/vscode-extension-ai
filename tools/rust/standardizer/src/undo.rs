use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(crate) enum Undo {
    RestoreFile { path: PathBuf, previous: Vec<u8> },
    RemoveFile(PathBuf),
    RemoveDirectory(PathBuf),
}

impl Undo {
    pub(crate) fn rollback(self) -> io::Result<()> {
        match self {
            Self::RestoreFile { path, previous } => fs::write(path, previous),
            Self::RemoveFile(path) => fs::remove_file(path),
            Self::RemoveDirectory(path) => fs::remove_dir(path),
        }
    }

    pub(crate) fn path(&self) -> &Path {
        match self {
            Self::RestoreFile { path, .. }
            | Self::RemoveFile(path)
            | Self::RemoveDirectory(path) => path,
        }
    }
}
