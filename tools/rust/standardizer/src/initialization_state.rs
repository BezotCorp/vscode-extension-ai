use crate::{anomaly::Anomaly, repository::Repository, store_lock::StoreLock};
use std::{error::Error, fs, io, path::Path};

pub(crate) const GLOBAL_INDEX_FILE: &str = "global_index.ron";

/// Where a store folder stands in its life cycle. Only `Virgin` allows a new
/// initialization; the absence of `.lock` alone never does.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum InitializationState {
    /// Nothing there, nor in the accessible Git history: a new system may be created.
    Virgin,
    /// `.lock` and `global_index.ron` both exist: normal operation.
    Initialized,
    /// An existing store without `.lock` and without proof it ever had one:
    /// it may be adopted explicitly, once.
    AdoptionPending,
    Anomaly(Anomaly),
}

impl InitializationState {
    /// Inspects the folder. Git history is only consulted when `.lock` is absent,
    /// so normal operation never pays for it.
    pub(crate) fn inspect(directory: &Path) -> Result<Self, Box<dyn Error>> {
        let global = directory.join(GLOBAL_INDEX_FILE).is_file();
        if StoreLock::exists(directory) {
            return Ok(if global {
                Self::Initialized
            } else {
                Self::Anomaly(Anomaly::GlobalLost)
            });
        }
        let lock_was_committed = Self::history_touches(directory, StoreLock::FILE_NAME)?;
        if lock_was_committed {
            return Ok(Self::Anomaly(Anomaly::LockLost));
        }
        if global {
            return Ok(Self::AdoptionPending);
        }
        if Self::has_entries(directory)? {
            return Ok(Self::Anomaly(Anomaly::OrphanData));
        }
        if Self::history_touches(directory, GLOBAL_INDEX_FILE)? {
            return Ok(Self::Anomaly(Anomaly::LostSystemHistory));
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

    fn history_touches(directory: &Path, name: &str) -> Result<bool, Box<dyn Error>> {
        let Some(repository) = Repository::containing(Self::existing_ancestor(directory))? else {
            return Ok(false);
        };
        // The folder may not exist yet: resolve through its closest existing ancestor.
        let ancestor = Self::existing_ancestor(directory).canonicalize()?;
        let relative = ancestor
            .strip_prefix(repository.root())
            .map_err(|_| "store folder is outside its Git repository")?
            .join(directory.strip_prefix(Self::existing_ancestor(directory))?)
            .join(name);
        repository.history_touches(&[relative.as_path()])
    }

    fn existing_ancestor(directory: &Path) -> &Path {
        let mut current = directory;
        while !current.exists() {
            match current.parent() {
                Some(parent) => current = parent,
                None => break,
            }
        }
        current
    }
}
