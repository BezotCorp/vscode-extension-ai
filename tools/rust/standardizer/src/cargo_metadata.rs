use crate::{rust_edition::RustEdition, rust_package::RustPackage};
use serde::Deserialize;
use std::{error::Error, path::Path, process::Command};

#[derive(Deserialize, Default)]
pub(crate) struct CargoMetadata {
    packages: Vec<RustPackage>,
}

impl CargoMetadata {
    pub(crate) fn load(root: &Path) -> Result<Self, Box<dyn Error>> {
        if !root.join("Cargo.toml").is_file() {
            return Ok(Self::default());
        }
        let output = Command::new("cargo")
            .current_dir(root)
            .args([
                "metadata",
                "--no-deps",
                "--format-version=1",
                "--locked",
                "--offline",
            ])
            .output()?;
        if !output.status.success() {
            return Err(format!(
                "cargo metadata failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )
            .into());
        }
        Ok(serde_json::from_slice(&output.stdout)?)
    }

    pub(crate) fn edition(&self, path: &Path) -> Option<RustEdition> {
        self.packages
            .iter()
            .filter(|package| {
                package
                    .directory()
                    .is_some_and(|directory| path.starts_with(directory))
            })
            .max_by_key(|package| {
                package
                    .directory()
                    .map(|directory| directory.components().count())
            })
            .map(RustPackage::edition)
    }
}
