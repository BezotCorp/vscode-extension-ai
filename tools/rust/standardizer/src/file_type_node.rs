use crate::{file_extension::FileExtension, graph_system::NodeBase};
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct FileTypeNode {
    base: NodeBase,
    extension: FileExtension,
}
impl FileTypeNode {
    #[allow(dead_code, reason = "authoring API without a CLI caller yet")]
    pub(crate) fn new(base: NodeBase, extension: FileExtension) -> Self {
        Self { base, extension }
    }
    pub(crate) fn base_mut(&mut self) -> &mut NodeBase {
        &mut self.base
    }
    pub(crate) fn base(&self) -> &NodeBase {
        &self.base
    }
    pub(crate) fn extension(&self) -> &OsStr {
        self.extension.as_os_str()
    }
}
