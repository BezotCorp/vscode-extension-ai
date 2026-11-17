use crate::{
    data_placement::{DataPlacementOrchestrator, StoreInitializationPipeline},
    graph_system::GraphReader,
};
use std::{
    error::Error,
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
};

/// Explicit operations on the store life cycle, distinct from conformance.
pub(crate) enum StoreCommand {
    Initialize {
        directory: PathBuf,
        tag_registry: PathBuf,
        write_locations: PathBuf,
    },
    Adopt,
}

impl StoreCommand {
    /// `None` when the arguments are not a store command (conformance then applies).
    pub(crate) fn parse(arguments: &[OsString]) -> Result<Option<Self>, Box<dyn Error>> {
        let usage =
            "usage: standardizer init <directory> <tag_registry.ron> <write_locations.ron> | adopt";
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
            Some("adopt") => Err(usage.into()),
            _ => Ok(None),
        }
    }

    /// Runs the command and reports the store it initialized or adopted.
    pub(crate) fn run(self) -> Result<(), Box<dyn Error>> {
        let (action, directory) = match self {
            Self::Initialize {
                directory,
                tag_registry,
                write_locations,
            } => {
                StoreInitializationPipeline::initialize(
                    &directory,
                    &fs::read_to_string(tag_registry)?,
                    &fs::read_to_string(write_locations)?,
                    Self::verify,
                )?;
                ("initialized", directory)
            }
            Self::Adopt => {
                let directory = DataPlacementOrchestrator::default_directory();
                StoreInitializationPipeline::adopt(&directory, Self::verify)?;
                ("adopted", directory)
            }
        };
        println!("standardizer store {action}: {}", directory.display());
        Ok(())
    }

    /// The graph rules a store must satisfy before it is declared initialized.
    fn verify(directory: &Path) -> Result<(), Box<dyn Error>> {
        GraphReader::open(directory).map(drop)
    }
}
