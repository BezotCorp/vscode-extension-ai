use super::{
    GLOBAL_INDEX_FILE, InitializationState, RonFile, StoreLock, StoredFile, WriteTransaction,
};
use crate::location::Location;
use serde::de::DeserializeOwned;
use std::{
    error::Error,
    path::{Path, PathBuf},
};

pub(crate) const TAG_REGISTRY_FILE: &str = "tag_registry.ron";
pub(crate) const WRITE_LOCATIONS_FILE: &str = "write_locations.ron";

/// Manager of the persistent storage (local files): the only code that reads or
/// writes them. It knows locations, formats and transactions, and nothing of
/// what the stored data means.
pub(crate) struct StorageManager {
    directory: PathBuf,
}

impl StorageManager {
    pub(crate) fn new(directory: &Path) -> Self {
        Self {
            directory: directory.to_path_buf(),
        }
    }

    pub(crate) fn inspect(&self) -> Result<InitializationState, Box<dyn Error>> {
        InitializationState::inspect(&self.directory)
    }

    pub(crate) fn read<T: DeserializeOwned>(
        &self,
        location: &Location,
    ) -> Result<T, Box<dyn Error>> {
        RonFile::read(&location.resolve(&self.directory))
    }

    /// Reads a file placed directly in the store folder.
    pub(crate) fn read_named<T: DeserializeOwned>(
        &self,
        file_name: &str,
    ) -> Result<T, Box<dyn Error>> {
        RonFile::read(&self.directory.join(file_name))
    }

    pub(crate) fn exists(&self, location: &Location) -> bool {
        location.resolve(&self.directory).exists()
    }

    pub(crate) fn is_file(&self, location: &Location) -> bool {
        location.resolve(&self.directory).is_file()
    }

    /// Record first, global index last: the global index is the commit point.
    /// On failure every applied change is reverted.
    pub(crate) fn commit(
        &self,
        record: StoredFile,
        indexes: Vec<StoredFile>,
        global: &[u8],
    ) -> Result<(), Box<dyn Error>> {
        let mut transaction = WriteTransaction::begin();
        let outcome = (|| -> Result<(), Box<dyn Error>> {
            let path = record.location().resolve(&self.directory);
            transaction.create_directories(path.parent().ok_or("record without folder")?)?;
            for index in &indexes {
                let index_path = index.location().resolve(&self.directory);
                transaction
                    .create_directories(index_path.parent().ok_or("index without folder")?)?;
            }
            if record.creates() {
                transaction.create_file(&path, record.bytes())?;
            } else {
                transaction.replace_file(&path, record.bytes())?;
            }
            for index in &indexes {
                transaction
                    .replace_file(&index.location().resolve(&self.directory), index.bytes())?;
            }
            transaction.replace_file(&self.directory.join(GLOBAL_INDEX_FILE), global)
        })();
        match outcome {
            Ok(()) => {
                transaction.commit();
                Ok(())
            }
            Err(error) => match transaction.rollback() {
                Ok(()) => Err(error),
                Err(failures) => Err(format!("{error}; rollback incomplete: {failures}").into()),
            },
        }
    }

    /// Creates the folder and `files`, runs `verify` on what was created, then
    /// creates `.lock` last. Any earlier failure removes what this call created.
    pub(crate) fn create_store(
        &self,
        files: &[(&str, &[u8])],
        verify: impl FnOnce() -> Result<(), Box<dyn Error>>,
    ) -> Result<(), Box<dyn Error>> {
        let mut transaction = WriteTransaction::begin();
        let outcome = (|| -> Result<(), Box<dyn Error>> {
            transaction.create_directories(&self.directory)?;
            for (name, bytes) in files {
                transaction.create_file(&self.directory.join(name), bytes)?;
            }
            verify()?;
            StoreLock::create(&self.directory)
        })();
        match outcome {
            Ok(()) => {
                transaction.commit();
                Ok(())
            }
            Err(error) => match transaction.rollback() {
                Ok(()) => Err(error),
                Err(failures) => Err(format!("{error}; rollback incomplete: {failures}").into()),
            },
        }
    }

    /// Declares an existing store initialized: `.lock` is created only once `verify` passes.
    pub(crate) fn seal(
        &self,
        verify: impl FnOnce() -> Result<(), Box<dyn Error>>,
    ) -> Result<(), Box<dyn Error>> {
        verify()?;
        StoreLock::create(&self.directory)
    }
}
