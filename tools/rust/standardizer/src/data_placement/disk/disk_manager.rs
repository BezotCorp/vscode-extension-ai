use super::{
    initialization_state::{GLOBAL_INDEX_FILE, InitializationState},
    record_file::RecordFile,
    ron_file::RonFile,
    store_lock::StoreLock,
    stored_file::StoredFile,
    write_transaction::WriteTransaction,
};
use crate::location::Location;
use serde::{Serialize, de::DeserializeOwned};
use std::{
    error::Error,
    path::{Path, PathBuf},
};


/// Manager of the persistent storage (local files): the only code that reads or
/// writes them. It knows locations, formats and transactions, and nothing of
/// what the stored data means.
pub(crate) struct DiskManager {
    directory: PathBuf,
}

impl DiskManager {
    pub(crate) const TAG_REGISTRY_FILE: &'static str = "tag_registry.ron";
    pub(crate) const WRITE_LOCATIONS_FILE: &'static str = "write_locations.ron";
    pub(crate) const GLOBAL_INDEX_FILE: &'static str = GLOBAL_INDEX_FILE;
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

    /// Encodes and persists records and indexes on local disk.
    pub(crate) fn persist<R: Serialize, I: Serialize, G: Serialize>(
        &self,
        record: RecordFile<'_, R>,
        indexes: &[(Location, I)],
        global: &G,
    ) -> Result<(), Box<dyn Error>> {
        let record = match record {
            RecordFile::Create(path, value) =>
                StoredFile::create(path, RonFile::render_compact(value)?),
            RecordFile::Replace(path, value) =>
                StoredFile::replace(path, RonFile::render_compact(value)?),
        };
        let indexes = indexes.iter().map(|(path, value)| {
            Ok(StoredFile::replace(
                path.clone(),
                RonFile::render_pretty(value)?,
            ))
        }).collect::<Result<Vec<_>, Box<dyn Error>>>()?;
        let global = RonFile::render_pretty(global)?;
        self.commit_files(record, indexes, &global)
    }

    /// Record first, global index last: the global index is the commit point.
    /// On failure every applied change is reverted.
    fn commit_files(
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
    pub(crate) fn create_store<G: Serialize>(
        &self,
        tags: &str,
        locations: &str,
        global: &G,
        verify: impl FnOnce() -> Result<(), Box<dyn Error>>,
    ) -> Result<(), Box<dyn Error>> {
        let global_bytes = RonFile::render_pretty(global)?;
        let files: [(&str, &[u8]); 3] = [
            (Self::TAG_REGISTRY_FILE, tags.as_bytes()),
            (Self::WRITE_LOCATIONS_FILE, locations.as_bytes()),
            (Self::GLOBAL_INDEX_FILE, &global_bytes),
        ];
        let mut transaction = WriteTransaction::begin();
        let outcome = (|| -> Result<(), Box<dyn Error>> {
            transaction.create_directories(&self.directory)?;
            for (name, bytes) in &files {
                transaction.create_file(&self.directory.join(name), bytes)?;
            }
            verify()?;
            transaction.create_file(&StoreLock::path(&self.directory), &[])
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
