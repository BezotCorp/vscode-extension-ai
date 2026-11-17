use crate::{node_base::NodeBase, tool::Tool};
use serde::{Deserialize, Serialize};
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ToolNode {
    base: NodeBase,
    tool: Tool,
}
impl ToolNode {
    #[allow(dead_code, reason = "authoring API without a CLI caller yet")]
    pub(crate) fn new(base: NodeBase, tool: Tool) -> Self {
        Self { base, tool }
    }

    pub(crate) fn base_mut(&mut self) -> &mut NodeBase {
        &mut self.base
    }

    pub(crate) fn base(&self) -> &NodeBase {
        &self.base
    }

    pub(crate) fn tool(&self) -> Tool {
        self.tool
    }
}
