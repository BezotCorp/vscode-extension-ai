use crate::data_placement::{DiskManager, InitializationState};
use crate::{
    graph_system::GlobalIndex, tag_registry::TagRegistry, write_locations::WriteLocations,
};
use std::{error::Error, path::Path};

/// Initialization or adoption of a store. The only code allowed to bring a store to the initialized state, and only on
/// explicit request. Normal operation never reaches it. The caller supplies the
/// verification of the stored graph, which is a domain rule.
pub(crate) struct StoreInitializationPipeline;

impl StoreInitializationPipeline {
    /// Creates a new, empty system in a really virgin location from the given
    /// tag registry and write configuration. `.lock` is created last, after the
    /// whole store loads and verifies; any earlier failure removes what this call created.
    pub(crate) fn initialize(
        directory: &Path,
        tag_registry: &str,
        write_locations: &str,
        verify: impl FnOnce(&Path) -> Result<(), Box<dyn Error>>,
    ) -> Result<(), Box<dyn Error>> {
        let storage = DiskManager::new(directory);
        Self::require(&storage, InitializationState::Virgin, "initialize")?;
        let tags: TagRegistry = ron::from_str(tag_registry)?;
        tags.validate()?;
        let locations: WriteLocations = ron::from_str(write_locations)?;
        locations.validate(&tags)?;

        storage.create_store(
            tag_registry,
            write_locations,
            &GlobalIndex::empty(),
            || verify(directory),
        )
    }

    /// Declares an existing store initialized, once. It verifies the store as it
    /// is; no index is created, no identity changes, no record is rewritten.
    pub(crate) fn adopt(
        directory: &Path,
        verify: impl FnOnce(&Path) -> Result<(), Box<dyn Error>>,
    ) -> Result<(), Box<dyn Error>> {
        let storage = DiskManager::new(directory);
        Self::require(&storage, InitializationState::AdoptionPending, "adopt")?;
        storage.seal(|| verify(directory))
    }

    fn require(
        storage: &DiskManager,
        expected: InitializationState,
        action: &str,
    ) -> Result<(), Box<dyn Error>> {
        let state = storage.inspect()?;
        if state == expected {
            return Ok(());
        }
        Err(format!("refusing to {action}: {}", Self::describe(state)).into())
    }

    fn describe(state: InitializationState) -> String {
        match state {
            InitializationState::Virgin => "the location is new, use `init`".to_owned(),
            InitializationState::Initialized => "the system is already initialized".to_owned(),
            InitializationState::AdoptionPending => {
                "an existing system is waiting to be adopted, use `adopt`".to_owned()
            }
            InitializationState::Anomaly(anomaly) => anomaly.to_string(),
        }
    }
}
