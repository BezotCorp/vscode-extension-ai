use std::{
    error::Error,
    fs::OpenOptions,
    path::{Path, PathBuf},
};

/// Permanent witness that a store was fully initialized. An empty file, created
/// once and never rewritten, replaced or removed by normal operation. It is not
/// a concurrency lock.
pub(crate) struct StoreLock;

impl StoreLock {
    pub(crate) const FILE_NAME: &'static str = ".lock";

    pub(crate) fn path(directory: &Path) -> PathBuf {
        directory.join(Self::FILE_NAME)
    }

    pub(crate) fn exists(directory: &Path) -> bool {
        Self::path(directory).exists()
    }

    /// Creates the witness; fails when it already exists.
    pub(crate) fn create(directory: &Path) -> Result<(), Box<dyn Error>> {
        let path = Self::path(directory);
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|error| format!("{}: {error}", path.display()))?;
        file.sync_all()
            .map_err(|error| format!("{}: {error}", path.display()))?;
        Ok(())
    }
}
