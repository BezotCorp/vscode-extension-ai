use crate::{
    data_placement::{
        disk::{DiskManager, InitializationState, RecordFile},
        ram::RamManager,
    },
    graph_system::GlobalIndex,
    location::Location,
    tag_registry::TagRegistry,
    write_locations::WriteLocations,
};
use serde::{Serialize, de::DeserializeOwned};
use std::{
    error::Error,
    path::{Path, PathBuf},
};

/// Coordinates resident data and persistent storage.
pub(crate) struct DataPlacementOrchestrator {
    ram: RamManager<&'static str>,
    disk: DiskManager,
    initialized: bool,
}

impl DataPlacementOrchestrator {
    const TAGS: &'static str = "tags";
    const GLOBAL: &'static str = "global";
    const DESTINATIONS: &'static str = "destinations";

    pub(crate) fn default_directory() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../data/standardizer")
    }

    /// Opens an existing store without creating or modifying it.
    pub(crate) fn load(directory: &Path) -> Result<Self, Box<dyn Error>> {
        let disk = DiskManager::new(directory);

        let initialized = match disk.inspect()? {
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

        let tags: TagRegistry = disk.read_named(DiskManager::TAG_REGISTRY_FILE)?;
        tags.validate()?;

        let destinations: WriteLocations = disk.read_named(DiskManager::WRITE_LOCATIONS_FILE)?;
        destinations.validate(&tags)?;

        let global: GlobalIndex = disk.read_named(DiskManager::GLOBAL_INDEX_FILE)?;

        let mut ram = RamManager::new();
        ram.insert(Self::TAGS, tags);
        ram.insert(Self::DESTINATIONS, destinations);
        ram.insert(Self::GLOBAL, global);

        Ok(Self {
            ram,
            disk,
            initialized,
        })
    }

    pub(crate) fn require_initialized(&self) -> Result<(), Box<dyn Error>> {
        if self.initialized {
            return Ok(());
        }

        Err("the store is not initialized: adopt it explicitly before writing".into())
    }

    pub(crate) fn tags(&self) -> &TagRegistry {
        self.ram
            .get::<TagRegistry>(&Self::TAGS)
            .expect("tag registry must be resident")
    }

    pub(crate) fn global(&self) -> &GlobalIndex {
        self.ram
            .get::<GlobalIndex>(&Self::GLOBAL)
            .expect("global index must be resident")
    }

    pub(crate) fn destinations(&self) -> &WriteLocations {
        self.ram
            .get::<WriteLocations>(&Self::DESTINATIONS)
            .expect("write locations must be resident")
    }

    pub(crate) fn into_tags(mut self) -> TagRegistry {
        self.ram
            .remove::<TagRegistry>(&Self::TAGS)
            .expect("tag registry must be resident")
    }

    pub(crate) fn read<T: DeserializeOwned>(
        &self,
        location: &Location,
    ) -> Result<T, Box<dyn Error>> {
        self.disk.read(location)
    }

    pub(crate) fn contains(&self, location: &Location) -> bool {
        self.disk.exists(location)
    }

    pub(crate) fn contains_file(&self, location: &Location) -> bool {
        self.disk.is_file(location)
    }

    /// Commits the record, its indexes and the global index atomically.
    /// Resident metadata is updated only after disk persistence succeeds.
    pub(crate) fn persist<R: Serialize, I: Serialize>(
        &mut self,
        record: RecordFile<'_, R>,
        indexes: &[(Location, I)],
        global: GlobalIndex,
    ) -> Result<(), Box<dyn Error>> {
        self.require_initialized()?;

        self.disk.persist(record, indexes, &global)?;

        self.ram.insert(Self::GLOBAL, global);

        Ok(())
    }
}
