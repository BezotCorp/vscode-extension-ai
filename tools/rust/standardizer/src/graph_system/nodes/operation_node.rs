use crate::{graph_system::NodeBase, operation::Operation};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct OperationNode {
    base: NodeBase,
    operation: Operation,
}

impl OperationNode {
    pub(crate) fn new(base: NodeBase, operation: Operation) -> Self {
        Self { base, operation }
    }

    pub(crate) fn base_mut(&mut self) -> &mut NodeBase {
        &mut self.base
    }

    pub(crate) fn base(&self) -> &NodeBase {
        &self.base
    }

    pub(crate) fn operation(&self) -> Operation {
        self.operation
    }
}
