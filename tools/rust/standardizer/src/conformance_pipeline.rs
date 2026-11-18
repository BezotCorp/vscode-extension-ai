use crate::{conformance_intent::ConformanceIntent, git_repository::GitRepository};
use std::{error::Error, ffi::OsString};

/// Conformance of the tracked files: read the intent, find the repository and
/// its candidate files, then conform them (and, to fix, restage what changed).
pub(crate) struct ConformancePipeline;

impl ConformancePipeline {
    pub(crate) fn run(arguments: Vec<OsString>) -> Result<(), Box<dyn Error>> {
        let intent = ConformanceIntent::from_arguments(arguments.into_iter())?;
        let repository = GitRepository::discover()?;
        let files = repository.candidates()?;
        repository.conform(&files, intent)?;
        Ok(())
    }
}
