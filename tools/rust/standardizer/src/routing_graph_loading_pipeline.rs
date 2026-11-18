use crate::{
    criterion::Criterion,
    graph_system::{Edge, GraphReader, Interpretation, Node},
    routing_graph::RoutingGraph,
};
use std::{collections::BTreeMap, error::Error, path::Path};

/// Loading of the routing graph: open and verify the store, read nodes, edges
/// then interpretations by tag with their checks, and assemble the graph.
pub(crate) struct RoutingGraphLoadingPipeline;

impl RoutingGraphLoadingPipeline {
    /// Loads the graph by tag: the global index orients toward the physical
    /// hierarchy of each domain, whose aggregated tags then lead to the records.
    pub(crate) fn run(directory: &Path) -> Result<RoutingGraph, Box<dyn Error>> {
        let store = GraphReader::open(directory)?;
        let reader = GraphReader::new(&store);
        let mut nodes = BTreeMap::new();
        let criteria = |domain: &str| Criterion::set(&[domain, "physical"]);
        for node in
            reader.records_tagged::<Node>(&criteria("node")?, &store.tags().find("node")?)?
        {
            if nodes.insert(node.base().id(), node).is_some() {
                return Err("duplicate node identity".into());
            }
        }
        let mut edges = BTreeMap::new();
        for edge in
            reader.records_tagged::<Edge>(&criteria("edge")?, &store.tags().find("edge")?)?
        {
            if edge.nodes().is_empty() || edge.nodes().iter().any(|node| !nodes.contains_key(node))
            {
                return Err("edge links an unknown node or none".into());
            }
            if edges.insert(edge.base().id(), edge).is_some() {
                return Err("duplicate edge identity".into());
            }
        }
        let tag = store.tags().find("interpretation")?;
        for interpretation in
            reader.records_tagged::<Interpretation>(&criteria("interpretation")?, &tag)?
        {
            if !edges.contains_key(&interpretation.edge()) {
                return Err("interpretation of an unknown edge".into());
            }
        }
        let graph = RoutingGraph::new(
            store.into_tags(),
            nodes,
            edges,
        );
        graph.validate_connections()?;
        Ok(graph)
    }
}
