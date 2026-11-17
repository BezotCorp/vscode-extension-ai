use crate::{
    criterion::Criterion,
    data_placement::DataPlacementOrchestrator,
    graph_system::{
        Edge, EdgeBase, EdgeId, GraphReader, Indexable, Interpretation, InterpretationBase, Node,
        NodeBase, NodeId,
    },
    id_uuid_v7::IdUuidV7,
    location::Location,
    mutation::Mutation,
    mutation_base::MutationBase,
    mutation_operation::MutationOperation,
    record_writer::RecordWriter,
    tag_id::TagId,
};
use std::{collections::BTreeSet, error::Error};

/// Creation and mutation of routing graph data. Each domain's structural tag is
/// added automatically and never propagated from one object to another.
#[allow(dead_code, reason = "authoring API without a CLI caller yet")]
pub(crate) struct RoutingWriter {
    store: DataPlacementOrchestrator,
}

#[allow(dead_code, reason = "authoring API without a CLI caller yet")]
impl RoutingWriter {
    pub(crate) fn new(store: DataPlacementOrchestrator) -> Self {
        Self { store }
    }

    /// Creates a node tagged `node` (plus `tags`) and indexes it.
    pub(crate) fn add_node(
        &mut self,
        tags: BTreeSet<TagId>,
        build: impl FnOnce(NodeBase) -> Node,
    ) -> Result<NodeId, Box<dyn Error>> {
        let domain = self.store.tags().find("node")?;
        let id = RecordWriter::add(&mut self.store, &domain, tags, |id, tags| {
            build(NodeBase::new(id.into(), tags))
        })?;
        Ok(id.into())
    }

    /// Creates an edge linking `nodes`, tagged `edge` plus their non-structural tags.
    pub(crate) fn add_edge(&mut self, nodes: BTreeSet<NodeId>) -> Result<EdgeId, Box<dyn Error>> {
        if nodes.is_empty() {
            return Err("an edge links at least one node".into());
        }
        let tags = self.node_tags(&nodes)?;
        let domain = self.store.tags().find("edge")?;
        let id = RecordWriter::add(&mut self.store, &domain, tags, |id, tags| {
            Edge::new(EdgeBase::new(id.into(), tags), nodes)
        })?;
        Ok(id.into())
    }

    /// Creates an interpretation of `edge`, tagged `interpretation` plus `tags`.
    pub(crate) fn add_interpretation(
        &mut self,
        edge: EdgeId,
        tags: BTreeSet<TagId>,
    ) -> Result<IdUuidV7, Box<dyn Error>> {
        self.record::<Edge>("edge", edge.id_uuid_v7())?;
        let domain = self.store.tags().find("interpretation")?;
        RecordWriter::add(&mut self.store, &domain, tags, |id, tags| {
            Interpretation::new(InterpretationBase::new(id, tags), edge)
        })
    }

    /// Persists the intent first, then applies it everywhere it must reach.
    pub(crate) fn mutate(
        &mut self,
        operation: MutationOperation,
    ) -> Result<IdUuidV7, Box<dyn Error>> {
        let (MutationOperation::AddNodeTag { tag, .. }
        | MutationOperation::RemoveNodeTag { tag, .. }) = operation;
        if !self.store.tags().contains(&tag)
            || self.store.destinations().structural_tags().contains(&tag)
        {
            return Err("only registered, non-structural tags can be mutated".into());
        }
        let domain = self.store.tags().find("mutation")?;
        let pending = self.store.tags().find("pending")?;
        let id = RecordWriter::add(
            &mut self.store,
            &domain,
            BTreeSet::from([pending]),
            |id, tags| Mutation::new(MutationBase::new(id, tags), operation),
        )?;
        let (mutation, location) = self.record::<Mutation>("mutation", id)?;
        self.apply(mutation, &location)?;
        Ok(id)
    }

    /// Finds the pending mutations through the indexes and finishes them.
    pub(crate) fn resume_pending(&mut self) -> Result<usize, Box<dyn Error>> {
        let pending = self.store.tags().find("pending")?;
        let found = GraphReader::new(&self.store)
            .records_tagged::<Mutation>(&Criterion::set(&["mutation", "physical"])?, &pending)?;
        let count = found.len();
        for mutation in found {
            let (mutation, location) = self.record::<Mutation>("mutation", mutation.id())?;
            self.apply(mutation, &location)?;
        }
        Ok(count)
    }

    /// Idempotent: each step checks what is already done, so a crash anywhere
    /// leaves a pending mutation that can be applied again.
    fn apply(&mut self, mut mutation: Mutation, location: &Location) -> Result<(), Box<dyn Error>> {
        let (node_id, tag, add) = match mutation.operation() {
            MutationOperation::AddNodeTag { node, tag } => (node, tag, true),
            MutationOperation::RemoveNodeTag { node, tag } => (node, tag, false),
        };
        let (mut node, node_location) = self.record::<Node>("node", node_id.id_uuid_v7())?;
        let mut tags = node.base().tags().clone();
        if add {
            tags.insert(tag);
        } else {
            tags.remove(&tag);
        }
        node.set_tags(tags);
        // Always replayed: identical files are skipped and indexes are recomputed,
        // which also repairs a replay after a crash between a file and its indexes.
        RecordWriter::replace(&mut self.store, &node, &node_location)?;
        let edge_tag = self.store.tags().find("edge")?;
        let partition = self.store.destinations().for_tag(&edge_tag)?.partition();
        let referrers = GraphReader::new(&self.store).referrers(
            &Criterion::set(&["edge", "node", "reference"])?,
            partition,
            node_id.id_uuid_v7(),
        )?;
        for (edge_id, edge_location) in referrers {
            let mut edge: Edge = self.store.read(&edge_location)?;
            if edge.id() != edge_id || !edge.nodes().contains(&node_id) {
                return Err("stale edge reference index".into());
            }
            let mut expected = self.node_tags(edge.nodes())?;
            expected.insert(edge_tag);
            edge.set_tags(expected);
            RecordWriter::replace(&mut self.store, &edge, &edge_location)?;
        }
        let pending = self.store.tags().find("pending")?;
        let done = self.store.tags().find("done")?;
        let mut tags = mutation.tags().clone();
        tags.remove(&pending);
        tags.insert(done);
        mutation.set_tags(tags);
        RecordWriter::replace(&mut self.store, &mutation, location)
    }

    /// Union of the non-structural tags of the given nodes.
    fn node_tags(&self, nodes: &BTreeSet<NodeId>) -> Result<BTreeSet<TagId>, Box<dyn Error>> {
        let structural = self.store.destinations().structural_tags();
        let mut tags = BTreeSet::new();
        for node in nodes {
            let (node, _) = self.record::<Node>("node", node.id_uuid_v7())?;
            tags.extend(
                node.base()
                    .tags()
                    .iter()
                    .filter(|tag| !structural.contains(tag)),
            );
        }
        Ok(tags)
    }

    /// Reads a record through the id indexes of its domain.
    fn record<R: Indexable>(
        &self,
        domain: &str,
        id: IdUuidV7,
    ) -> Result<(R, Location), Box<dyn Error>> {
        let tag = self.store.tags().find(domain)?;
        let partition = self.store.destinations().for_tag(&tag)?.partition();
        let location = GraphReader::new(&self.store)
            .locate(&Criterion::set(&[domain, "uuid"])?, partition, id)?
            .ok_or_else(|| format!("unknown {domain}: {id}"))?;
        let record: R = self.store.read(&location)?;
        if record.id() != id {
            return Err(format!("stale id index for {domain}: {id}").into());
        }
        Ok((record, location))
    }
}
