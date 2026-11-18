use crate::{
    conformance::Conformance, conformance_intent::ConformanceIntent, git_repository::GitRepository,
};
use std::{error::Error, ffi::OsString};

pub(crate) struct ConformancePipeline;

impl ConformancePipeline {
    pub(crate) fn run(arguments: impl Iterator<Item = OsString>) -> Result<(), Box<dyn Error>> {
        let intent = ConformanceIntent::from_arguments(arguments)?;
        let repository = GitRepository::discover()?;
        let files = repository.candidates()?;

        Conformance::execute(repository.root(), &files, intent)?;
        repository.stage_changed(&files, intent)?;

        Ok(())
    }
}
