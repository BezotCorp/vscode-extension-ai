use crate::id_uuid_v7::IdUuidV7;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(transparent)]
pub(crate) struct NodeId(IdUuidV7);

impl NodeId {
    pub(crate) fn id_uuid_v7(self) -> IdUuidV7 {
        self.0
    }
}

impl From<IdUuidV7> for NodeId {
    fn from(value: IdUuidV7) -> Self {
        Self(value)
    }
}
