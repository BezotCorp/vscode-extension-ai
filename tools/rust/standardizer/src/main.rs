mod biome;
mod cargo_metadata;
mod conformance;
mod conformance_intent;
mod creation_date;
mod criterion;
mod edge;
mod edge_base;
mod edge_id;
mod file_extension;
mod file_type_node;
mod global_entry;
mod global_index;
mod graph_store;
mod id_index;
mod id_uuid_v7;
mod index;
mod index_changes;
mod index_id;
mod index_orchestrator;
mod index_reference;
mod indexable;
mod intent_node;
mod intermediate_index;
mod interpretation;
mod interpretation_base;
mod location;
mod lookup_destination;
mod lookup_kind;
mod mutation;
mod mutation_base;
mod mutation_operation;
mod node;
mod node_base;
mod node_id;
mod operation;
mod operation_node;
mod orchestrated_index;
mod partition;
mod record_file;
mod record_writer;
mod reference_index;
mod relative_path;
mod repository;
mod ron_file;
mod routing_graph;
mod routing_writer;
mod rust_edition;
mod rust_package;
mod rustfmt;
mod tag_id;
mod tag_registry;
mod terminal_index;
mod tool;
mod tool_node;
mod tracked_file;
mod undo;
mod write_destination;
mod write_locations;
mod write_transaction;

use crate::conformance_intent::ConformanceIntent;
use crate::repository::Repository;
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
    let intent = ConformanceIntent::from_arguments(std::env::args_os().skip(1))?;
    let repository = Repository::discover()?;
    let files = repository.candidates()?;
    repository.conform(&files, intent)?;
    Ok(())
}
