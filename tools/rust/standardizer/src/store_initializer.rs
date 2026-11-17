use crate::{
    graph_store::{GraphStore, TAG_REGISTRY_FILE, WRITE_LOCATIONS_FILE},
    graph_system::GlobalIndex,
    initialization_state::{GLOBAL_INDEX_FILE, InitializationState},
    ron_file::RonFile,
    store_lock::StoreLock,
    tag_registry::TagRegistry,
    write_locations::WriteLocations,
    write_transaction::WriteTransaction,
};
use std::{error::Error, path::Path};

/// The only code allowed to bring a store to the initialized state, and only on
/// explicit request. Normal operation never reaches it.
pub(crate) struct StoreInitializer;

impl StoreInitializer {
    /// Creates a new, empty system in a really virgin location from the given
    /// tag registry and write configuration. `.lock` is created last, after the
    /// whole store loads and verifies; any earlier failure removes what this call created.
    pub(crate) fn initialize(
        directory: &Path,
        tag_registry: &str,
        write_locations: &str,
    ) -> Result<(), Box<dyn Error>> {
        Self::require(directory, InitializationState::Virgin, "initialize")?;
        let tags: TagRegistry = ron::from_str(tag_registry)?;
        tags.validate()?;
        let locations: WriteLocations = ron::from_str(write_locations)?;
        locations.validate(&tags)?;

        let mut transaction = WriteTransaction::begin();
        let outcome = (|| -> Result<(), Box<dyn Error>> {
            transaction.create_directories(directory)?;
            transaction.create_file(&directory.join(TAG_REGISTRY_FILE), tag_registry.as_bytes())?;
            transaction.create_file(
                &directory.join(WRITE_LOCATIONS_FILE),
                write_locations.as_bytes(),
            )?;
            transaction.create_file(
                &directory.join(GLOBAL_INDEX_FILE),
                &RonFile::render_pretty(&GlobalIndex::empty())?,
            )?;
            GraphStore::load(directory)?;
            StoreLock::create(directory)
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

    /// Declares an existing store initialized, once. It verifies the store as it
    /// is; no index is created, no identity changes, no record is rewritten.
    pub(crate) fn adopt(directory: &Path) -> Result<(), Box<dyn Error>> {
        Self::require(directory, InitializationState::AdoptionPending, "adopt")?;
        GraphStore::load(directory)?;
        StoreLock::create(directory)
    }

    fn require(
        directory: &Path,
        expected: InitializationState,
        action: &str,
    ) -> Result<(), Box<dyn Error>> {
        let state = InitializationState::inspect(directory)?;
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
