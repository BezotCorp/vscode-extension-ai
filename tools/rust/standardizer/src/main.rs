mod anomaly;
mod biome;
mod cargo_metadata;
mod conformance;
mod conformance_intent;
mod creation_date;
mod criterion;
mod file_extension;
mod file_type_node;
mod global_entry;
mod graph_store;
mod graph_system;
mod id_uuid_v7;
mod initialization_state;
mod intent_node;
mod location;
mod lookup_destination;
mod lookup_kind;
mod mutation;
mod mutation_base;
mod mutation_operation;
mod operation;
mod operation_node;
mod partition;
mod record_file;
mod record_writer;
mod relative_path;
mod repository;
mod ron_file;
mod routing_graph;
mod routing_writer;
mod rust_edition;
mod rust_package;
mod rustfmt;
mod store_command;
mod store_initializer;
mod store_lock;
mod tag_id;
mod tag_registry;
mod tool;
mod tool_node;
mod tracked_file;
mod undo;
mod write_destination;
mod write_locations;
mod write_transaction;

use crate::conformance_intent::ConformanceIntent;
use crate::repository::Repository;
use crate::store_command::StoreCommand;
use std::{error::Error, process::ExitCode};

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
    let arguments: Vec<_> = std::env::args_os().skip(1).collect();
    if let Some(command) = StoreCommand::parse(&arguments)? {
        return command.run();
    }
    let intent = ConformanceIntent::from_arguments(arguments.into_iter())?;
    let repository = Repository::discover()?;
    let files = repository.candidates()?;
    repository.conform(&files, intent)?;
    Ok(())
}
