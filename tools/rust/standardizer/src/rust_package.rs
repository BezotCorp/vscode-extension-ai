use crate::rust_edition::RustEdition;
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
pub(crate) struct RustPackage {
    manifest_path: PathBuf,
    edition: RustEdition,
}

impl RustPackage {
    pub(crate) fn directory(&self) -> Option<&Path> {
        self.manifest_path.parent()
    }

    pub(crate) fn edition(&self) -> RustEdition {
        self.edition
    }
}
