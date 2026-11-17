use crate::{node_id::NodeId, tag_id::TagId};
use serde::{Deserialize, Serialize};

/// A change that must reach every derived index and edge.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub(crate) enum MutationOperation {
    AddNodeTag { node: NodeId, tag: TagId },
    RemoveNodeTag { node: NodeId, tag: TagId },
}
