use crate::{
    biome::Biome, conformance_intent::ConformanceIntent, persistence_manager::StorageManager,
    routing_graph::RoutingGraph, rustfmt::Rustfmt, tool::Tool, tracked_file::TrackedFile,
};
use std::{collections::BTreeMap, error::Error, path::Path};
pub(crate) struct Conformance {
    graph: RoutingGraph,
}
impl Conformance {
    pub(crate) fn load() -> Result<Self, Box<dyn Error>> {
        Ok(Self {
            graph: RoutingGraph::load(&StorageManager::default_directory())?,
        })
    }
    pub(crate) fn execute(
        &self,
        root: &Path,
        files: &[TrackedFile],
        intent: ConformanceIntent,
    ) -> Result<(), Box<dyn Error>> {
        let mut batches = BTreeMap::new();
        for file in files {
            for tool in self.graph.tools(file.path(), intent)? {
                batches
                    .entry(tool)
                    .or_insert_with(Vec::new)
                    .push(file.path());
            }
        }
        let mut passed = true;
        for (tool, paths) in batches {
            passed &= match tool {
                Tool::Rustfmt => Rustfmt::execute(root, &paths, intent)?,
                Tool::Biome => Biome::execute(root, &paths, intent)?,
            };
        }
        if !passed {
            return Err("conformance failed".into());
        }
        Ok(())
    }
}
