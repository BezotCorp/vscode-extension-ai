use crate::{
    conformance_intent::ConformanceIntent,
    criterion::Criterion,
    graph_system::{Edge, EdgeId, GraphReader, Interpretation, Node, NodeId},
    operation::Operation,
    tag_registry::TagRegistry,
    tool::Tool,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    error::Error,
    path::Path,
};

pub(crate) struct RoutingGraph {
    tags: TagRegistry,
    nodes: BTreeMap<NodeId, Node>,
    edges: BTreeMap<EdgeId, Edge>,
}

impl RoutingGraph {
    /// Loads the graph by tag: the global index orients toward the physical
    /// hierarchy of each domain, whose aggregated tags then lead to the records.
    pub(crate) fn load(directory: &Path) -> Result<Self, Box<dyn Error>> {
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
        let graph = Self {
            tags: store.into_tags(),
            nodes,
            edges,
        };
        graph.validate_connections()?;
        Ok(graph)
    }

    fn tagged(&self, name: &str) -> Result<Vec<&Node>, Box<dyn Error>> {
        let tag = self.tags.find(name)?;
        Ok(self
            .nodes
            .values()
            .filter(|node| node.base().tags().contains(&tag))
            .collect())
    }

    /// Nodes tagged `name` sharing an edge with `node`. Edges are neutral and
    /// undirected: the roles come from the tags of the nodes they link.
    fn linked(&self, node: NodeId, name: &str) -> Result<Vec<&Node>, Box<dyn Error>> {
        let tag = self.tags.find(name)?;
        let mut found = BTreeSet::new();
        for edge in self
            .edges
            .values()
            .filter(|edge| edge.nodes().contains(&node))
        {
            for other in edge.nodes().iter().filter(|other| **other != node) {
                if self
                    .nodes
                    .get(other)
                    .ok_or("missing linked node")?
                    .base()
                    .tags()
                    .contains(&tag)
                {
                    found.insert(*other);
                }
            }
        }
        found
            .into_iter()
            .map(|id| {
                self.nodes
                    .get(&id)
                    .ok_or_else(|| "missing linked node".into())
            })
            .collect()
    }

    fn validate_connections(&self) -> Result<(), Box<dyn Error>> {
        for intent in [
            ConformanceIntent::CheckConformance,
            ConformanceIntent::FixConformance,
        ] {
            let intents = self.tagged("intent")?;
            if intents
                .iter()
                .filter(|node| matches!(node, Node::Intent(node) if node.intent() == intent))
                .count()
                != 1
            {
                return Err("expected exactly one node per conformance intent".into());
            }
            let mut extensions = BTreeSet::new();
            for node in self.tagged("file-type")? {
                let Node::FileType(file_type) = node else {
                    return Err("file-type tag on incompatible node".into());
                };
                if !extensions.insert(file_type.extension()) {
                    return Err("duplicate file extension".into());
                }
                self.tools_for_type(node.base().id(), intent)?;
            }
        }
        Ok(())
    }

    fn tools_for_type(
        &self,
        file_type: NodeId,
        intent: ConformanceIntent,
    ) -> Result<Vec<Tool>, Box<dyn Error>> {
        let intent_node = self
            .tagged("intent")?
            .into_iter()
            .find(|node| matches!(node, Node::Intent(node) if node.intent() == intent))
            .ok_or("missing intent node")?;
        let required: BTreeSet<_> = self
            .linked(intent_node.base().id(), "operation")?
            .into_iter()
            .map(|node| match node {
                Node::Operation(node) => Ok(node.operation()),
                _ => Err("expected operation node"),
            })
            .collect::<Result<_, _>>()?;
        let mut owners: BTreeMap<Operation, Tool> = BTreeMap::new();
        for target in self.linked(file_type, "tool")? {
            let Node::Tool(tool) = target else {
                return Err("expected tool node".into());
            };
            for operation in self.linked(tool.base().id(), "operation")? {
                let Node::Operation(operation) = operation else {
                    return Err("expected operation node".into());
                };
                if required.contains(&operation.operation())
                    && let Some(previous) = owners.insert(operation.operation(), tool.tool())
                    && previous != tool.tool()
                {
                    return Err("competing tools for the same operation".into());
                }
            }
        }
        Ok(owners
            .into_values()
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect())
    }

    pub(crate) fn tools(
        &self,
        path: &Path,
        intent: ConformanceIntent,
    ) -> Result<Vec<Tool>, Box<dyn Error>> {
        let Some(extension) = path.extension() else {
            return Ok(Vec::new());
        };
        for node in self.tagged("file-type")? {
            if let Node::FileType(file_type) = node
                && file_type.extension() == extension
            {
                return self.tools_for_type(file_type.base().id(), intent);
            }
        }
        Ok(Vec::new())
    }
}
