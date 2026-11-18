mod biome;
mod cargo_metadata;
mod conformance;
mod conformance_intent;
mod conformance_pipeline;
mod creation_date;
mod criterion;
mod data_placement;
mod file_extension;
mod git_repository;
mod global_entry;
mod graph_system;
mod id_uuid_v7;
mod location;
mod lookup_destination;
mod lookup_kind;
mod mutation;
mod mutation_application_pipeline;
mod mutation_base;
mod mutation_operation;
mod operation;
mod partition;
mod record_creation_pipeline;
mod record_replacement_pipeline;
mod relative_path;
mod routing_graph;
mod routing_graph_loading_pipeline;
mod rust_edition;
mod rust_package;
mod rustfmt;
mod store_command;
mod store_initialization_pipeline;
mod tag_id;
mod tag_registry;
mod tool;
mod tracked_file;
mod write_destination;
mod write_locations;

use std::{env, error::Error, process::ExitCode};

use crate::conformance_pipeline::ConformancePipeline;
use crate::store_command::StoreCommand;

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
    let arguments: Vec<_> = env::args_os().skip(1).collect();
    if let Some(command) = StoreCommand::parse(&arguments)? {
        return command.run();
    }
    ConformancePipeline::run(arguments)
}
