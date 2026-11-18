use serde_json::Value;
use std::{
    error::Error,
    path::{Path, PathBuf},
    process::Command,
};

pub(crate) struct CargoMetadata {
    packages: Vec<(PathBuf, String)>,
}

impl CargoMetadata {
    pub(crate) fn load(root: &Path) -> Result<Self, Box<dyn Error>> {
        if !root.join("Cargo.toml").is_file() {
            return Ok(Self {
                packages: Vec::new(),
            });
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

        let metadata: Value = serde_json::from_slice(&output.stdout)?;
        let packages = metadata["packages"]
            .as_array()
            .ok_or("missing Cargo packages")?
            .iter()
            .map(|package| {
                let manifest = package["manifest_path"]
                    .as_str()
                    .ok_or("missing Cargo manifest path")?;
                let edition = package["edition"].as_str().ok_or("missing Rust edition")?;
                let directory = Path::new(manifest)
                    .parent()
                    .ok_or("invalid Cargo manifest path")?;

                Ok((directory.to_path_buf(), edition.to_owned()))
            })
            .collect::<Result<Vec<_>, Box<dyn Error>>>()?;

        Ok(Self { packages })
    }

    pub(crate) fn edition(&self, path: &Path) -> Option<&str> {
        self.packages
            .iter()
            .filter(|(directory, _)| path.starts_with(directory))
            .max_by_key(|(directory, _)| directory.components().count())
            .map(|(_, edition)| edition.as_str())
    }
}
