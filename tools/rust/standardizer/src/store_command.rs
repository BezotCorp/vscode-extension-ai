use crate::{
    graph_store::GraphStore, lock_protection::LockProtection, protection::Protection,
    protection_step::ProtectionStep, store_initializer::StoreInitializer,
};
use std::{error::Error, ffi::OsString, fs, path::PathBuf};

/// Explicit operations on the store life cycle, distinct from conformance.
pub(crate) enum StoreCommand {
    Initialize {
        directory: PathBuf,
        tag_registry: PathBuf,
        write_locations: PathBuf,
    },
    Adopt,
    Protect,
}

impl StoreCommand {
    /// `None` when the arguments are not a store command (conformance then applies).
    pub(crate) fn parse(arguments: &[OsString]) -> Result<Option<Self>, Box<dyn Error>> {
        let usage = "usage: standardizer init <directory> <tag_registry.ron> <write_locations.ron> | adopt | protect";
        match arguments.first().and_then(|value| value.to_str()) {
            Some("init") => match arguments {
                [_, directory, tag_registry, write_locations] => Ok(Some(Self::Initialize {
                    directory: std::path::absolute(directory)?,
                    tag_registry: tag_registry.into(),
                    write_locations: write_locations.into(),
                })),
                _ => Err(usage.into()),
            },
            Some("adopt") if arguments.len() == 1 => Ok(Some(Self::Adopt)),
            Some("protect") if arguments.len() == 1 => Ok(Some(Self::Protect)),
            Some("adopt" | "protect") => Err(usage.into()),
            _ => Ok(None),
        }
    }

    /// Runs the command and reports; fails when the local commit is not acquired.
    pub(crate) fn run(self) -> Result<(), Box<dyn Error>> {
        let (protection, directory) = match self {
            Self::Initialize {
                directory,
                tag_registry,
                write_locations,
            } => (
                StoreInitializer::initialize(
                    &directory,
                    &fs::read_to_string(tag_registry)?,
                    &fs::read_to_string(write_locations)?,
                )?,
                directory,
            ),
            Self::Adopt => {
                let directory = GraphStore::default_directory();
                (StoreInitializer::adopt(&directory)?, directory)
            }
            Self::Protect => {
                let directory = GraphStore::default_directory();
                (LockProtection::protect(&directory)?, directory)
            }
        };
        Self::report(&protection, &directory.display().to_string())
    }

    fn report(protection: &Protection, directory: &str) -> Result<(), Box<dyn Error>> {
        println!("standardizer store: {directory}");
        for line in protection.describe() {
            println!("  {line}");
        }
        if matches!(protection.versioning(), ProtectionStep::NotAcquired(_)) {
            return Err("the lock exists but is not committed".into());
        }
        Ok(())
    }
}
