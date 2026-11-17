use super::{
    RecordFile,
    storage::{
        GLOBAL_INDEX_FILE, InitializationState, RonFile, StorageManager, StoredFile,
        TAG_REGISTRY_FILE, WRITE_LOCATIONS_FILE,
    },
};
use crate::{
    graph_system::GlobalIndex, location::Location, tag_registry::TagRegistry,
    write_locations::WriteLocations,
};
use serde::{Serialize, de::DeserializeOwned};
use std::{
    error::Error,
    path::{Path, PathBuf},
};

/// Link between the domains and the places where their data lives. Domains hand
/// it values and locations; it renders and routes them to the storage manager,
/// and keeps the resident copy of the global index, tag registry and write
/// configuration consistent with what is stored.
pub(crate) struct DataPlacementOrchestrator {
    storage: StorageManager,
    tags: TagRegistry,
    global: GlobalIndex,
    destinations: WriteLocations,
    initialized: bool,
}

impl DataPlacementOrchestrator {
    /// The store of this repository.
    pub(crate) fn default_directory() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../data/standardizer")
    }

    /// Opens an existing store. It never creates one: a new system is only made by
    /// `StoreInitializationPipeline`. A store waiting for adoption can be read, not written.
    /// Domain verification of what was loaded is up to the caller.
    pub(crate) fn load(directory: &Path) -> Result<Self, Box<dyn Error>> {
        let storage = StorageManager::new(directory);
        let initialized = match storage.inspect()? {
            InitializationState::Initialized => true,
            InitializationState::AdoptionPending => false,
            InitializationState::Virgin => {
                return Err(format!(
                    "no store at {}: initialize it explicitly",
                    directory.display()
                )
                .into());
            }
            InitializationState::Anomaly(anomaly) => {
                return Err(format!("{}: {anomaly}", directory.display()).into());
            }
        };
        let tags: TagRegistry = storage.read_named(TAG_REGISTRY_FILE)?;
        tags.validate()?;
        let destinations: WriteLocations = storage.read_named(WRITE_LOCATIONS_FILE)?;
        destinations.validate(&tags)?;
        let global = storage.read_named(GLOBAL_INDEX_FILE)?;
        Ok(Self {
            storage,
            tags,
            global,
            destinations,
            initialized,
        })
    }

    /// Writes are refused until the store has its `.lock`.
    pub(crate) fn require_initialized(&self) -> Result<(), Box<dyn Error>> {
        if self.initialized {
            return Ok(());
        }
        Err("the store is not initialized: adopt it explicitly before writing".into())
    }

    pub(crate) fn tags(&self) -> &TagRegistry {
        &self.tags
    }

    pub(crate) fn global(&self) -> &GlobalIndex {
        &self.global
    }

    pub(crate) fn destinations(&self) -> &WriteLocations {
        &self.destinations
    }

    pub(crate) fn into_tags(self) -> TagRegistry {
        self.tags
    }

    /// Reads the value stored at `location`.
    pub(crate) fn read<T: DeserializeOwned>(
        &self,
        location: &Location,
    ) -> Result<T, Box<dyn Error>> {
        self.storage.read(location)
    }

    pub(crate) fn contains(&self, location: &Location) -> bool {
        self.storage.exists(location)
    }

    pub(crate) fn contains_file(&self, location: &Location) -> bool {
        self.storage.is_file(location)
    }

    /// Persists a record, its index files and the new global index as one unit:
    /// everything is stored or nothing is. The resident global index is replaced
    /// only after the storage committed, so a failure leaves both unchanged.
    pub(crate) fn persist<R: Serialize, I: Serialize>(
        &mut self,
        record: RecordFile<'_, R>,
        indexes: &[(Location, I)],
        global: GlobalIndex,
    ) -> Result<(), Box<dyn Error>> {
        self.require_initialized()?;
        let record = match record {
            RecordFile::Create(location, record) => {
                StoredFile::create(location, RonFile::render_compact(record)?)
            }
            RecordFile::Replace(location, record) => {
                StoredFile::replace(location, RonFile::render_compact(record)?)
            }
        };
        let indexes = indexes
            .iter()
            .map(|(location, index)| {
                Ok(StoredFile::replace(
                    location.clone(),
                    RonFile::render_pretty(index)?,
                ))
            })
            .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
        let global_bytes = RonFile::render_pretty(&global)?;
        self.storage.commit(record, indexes, &global_bytes)?;
        self.global = global;
        Ok(())
    }
}
