use super::RoutingWriter;
use crate::{
    criterion::Criterion,
    graph_system::{Edge, GraphReader, Indexable, Node},
    location::Location,
    mutation::Mutation,
    mutation_operation::MutationOperation,
    record_replacement_pipeline::RecordReplacementPipeline,
};
use std::error::Error;

/// Application of a persisted mutation: the node, then every edge referencing
/// it, then the mutation itself marked done.
pub(crate) struct MutationApplicationPipeline;

impl MutationApplicationPipeline {
    /// Idempotent: each step checks what is already done, so a crash anywhere
    /// leaves a pending mutation that can be applied again.
    pub(crate) fn run(
        writer: &mut RoutingWriter,
        mut mutation: Mutation,
        location: &Location,
    ) -> Result<(), Box<dyn Error>> {
        let (node_id, tag, add) = match mutation.operation() {
            MutationOperation::AddNodeTag { node, tag } => (node, tag, true),
            MutationOperation::RemoveNodeTag { node, tag } => (node, tag, false),
        };
        let (mut node, node_location) = writer.record::<Node>("node", node_id.id_uuid_v7())?;
        let mut tags = node.base().tags().clone();
        if add {
            tags.insert(tag);
        } else {
            tags.remove(&tag);
        }
        node.set_tags(tags);
        // Always replayed: identical files are skipped and indexes are recomputed,
        // which also repairs a replay after a crash between a file and its indexes.
        RecordReplacementPipeline::run(&mut writer.store, &node, &node_location)?;
        let edge_tag = writer.store.tags().find("edge")?;
        let partition = writer.store.destinations().for_tag(&edge_tag)?.partition();
        let referrers = GraphReader::new(&writer.store).referrers(
            &Criterion::set(&["edge", "node", "reference"])?,
            partition,
            node_id.id_uuid_v7(),
        )?;
        for (edge_id, edge_location) in referrers {
            let mut edge: Edge = writer.store.read(&edge_location)?;
            if edge.id() != edge_id || !edge.nodes().contains(&node_id) {
                return Err("stale edge reference index".into());
            }
            let mut expected = writer.node_tags(edge.nodes())?;
            expected.insert(edge_tag);
            edge.set_tags(expected);
            RecordReplacementPipeline::run(&mut writer.store, &edge, &edge_location)?;
        }
        let pending = writer.store.tags().find("pending")?;
        let done = writer.store.tags().find("done")?;
        let mut tags = mutation.tags().clone();
        tags.remove(&pending);
        tags.insert(done);
        mutation.set_tags(tags);
        RecordReplacementPipeline::run(&mut writer.store, &mutation, location)
    }
}
