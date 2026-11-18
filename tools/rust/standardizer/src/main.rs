mod biome;
mod cargo_metadata;
mod conformance;
mod conformance_intent;
mod conformance_pipeline;
mod git_repository;
mod route;
mod routing;
mod rustfmt;
mod tool;
mod tracked_file;

use conformance_pipeline::ConformancePipeline;
use std::{env, error::Error, process::ExitCode};

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("standardizer: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    ConformancePipeline::run(env::args_os().skip(1))
}
