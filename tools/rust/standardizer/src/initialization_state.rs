use crate::{anomaly::Anomaly, store_lock::StoreLock};
use std::{error::Error, fs, io, path::Path};

pub(crate) const GLOBAL_INDEX_FILE: &str = "global_index.ron";

/// Where a store folder stands in its life cycle. Only `Virgin` allows a new
/// initialization; the absence of `.lock` alone never does.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum InitializationState {
    /// Nothing there: a new system may be created.
    Virgin,
    /// `.lock` and `global_index.ron` both exist: normal operation.
    Initialized,
    /// An existing store without `.lock`: it may be adopted explicitly, once.
    AdoptionPending,
    Anomaly(Anomaly),
}

impl InitializationState {
    /// Inspects the folder from its own files only: no Git, no network.
    pub(crate) fn inspect(directory: &Path) -> Result<Self, Box<dyn Error>> {
        let global = directory.join(GLOBAL_INDEX_FILE).is_file();
        if StoreLock::exists(directory) {
            return Ok(if global {
                Self::Initialized
            } else {
                Self::Anomaly(Anomaly::GlobalLost)
            });
        }
        if global {
            return Ok(Self::AdoptionPending);
        }
        if Self::has_entries(directory)? {
            return Ok(Self::Anomaly(Anomaly::OrphanData));
        }
        Ok(Self::Virgin)
    }

    fn has_entries(directory: &Path) -> Result<bool, Box<dyn Error>> {
        match fs::read_dir(directory) {
            Ok(mut entries) => Ok(entries.next().is_some()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(format!("{}: {error}", directory.display()).into()),
        }
    }
}
