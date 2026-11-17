use crate::{conformance_intent::ConformanceIntent, node_base::NodeBase};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct IntentNode {
    base: NodeBase,
    intent: ConformanceIntent,
}

impl IntentNode {
    #[expect(dead_code, reason = "authoring API without a CLI caller yet")]
    pub(crate) fn new(base: NodeBase, intent: ConformanceIntent) -> Self {
        Self { base, intent }
    }

    pub(crate) fn base_mut(&mut self) -> &mut NodeBase {
        &mut self.base
    }
    pub(crate) fn base(&self) -> &NodeBase {
        &self.base
    }

    pub(crate) fn intent(&self) -> ConformanceIntent {
        self.intent
    }
}
