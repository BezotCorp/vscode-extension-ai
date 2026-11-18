use crate::{cargo_metadata::CargoMetadata, conformance_intent::ConformanceIntent};
use std::{error::Error, path::Path, process::Command};

pub(crate) struct Rustfmt;

impl Rustfmt {
    pub(crate) fn execute(
        root: &Path,
        files: &[&Path],
        intent: ConformanceIntent,
    ) -> Result<bool, Box<dyn Error>> {
        if files.is_empty() {
            return Ok(true);
        }

        let metadata = CargoMetadata::load(root)?;
        let mut passed = true;

        for path in files {
            let absolute = root.join(path);
            let mut command = Command::new("rustfmt");

            command.current_dir(root);

            if let Some(edition) = metadata.edition(&absolute) {
                command.args(["--edition", edition]);
            }

            command.args(["--config", "skip_children=true"]);

            if intent == ConformanceIntent::CheckConformance {
                command.arg("--check");
            }

            passed &= command.arg(&absolute).status()?.success();
        }

        Ok(passed)
    }
}
