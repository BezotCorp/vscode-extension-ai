use crate::conformance_intent::ConformanceIntent;
use std::{error::Error, ffi::OsString, path::Path, process::Command};

pub(crate) struct Biome;

impl Biome {
    pub(crate) fn execute(
        root: &Path,
        files: &[&Path],
        intent: ConformanceIntent,
    ) -> Result<bool, Box<dyn Error>> {
        if files.is_empty() {
            return Ok(true);
        }

        let local = root.join("node_modules/.bin/biome");

        let executable = if local.is_file() {
            local.into_os_string()
        } else {
            OsString::from("biome")
        };

        let mut passed = true;

        for chunk in files.chunks(64) {
            let mut command = Command::new(&executable);

            command.current_dir(root).args([
                "check",
                "--files-ignore-unknown=true",
                "--no-errors-on-unmatched",
            ]);

            if intent == ConformanceIntent::FixConformance {
                command.arg("--write");
            }

            passed &= command
                .arg("--")
                .args(chunk.iter().map(|path| root.join(path)))
                .status()?
                .success();
        }

        Ok(passed)
    }
}
