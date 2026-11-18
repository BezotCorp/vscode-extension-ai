use crate::{conformance_intent::ConformanceIntent, tracked_file::TrackedFile};
use std::{
    error::Error,
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

pub(crate) struct GitRepository {
    root: PathBuf,
}

impl GitRepository {
    pub(crate) fn discover() -> Result<Self, Box<dyn Error>> {
        let output = Command::new("git")
            .args(["rev-parse", "--show-toplevel"])
            .output()?;

        if !output.status.success() {
            return Err("cannot find Git repository".into());
        }

        let mut bytes = output.stdout;
        if bytes.last() == Some(&b'\n') {
            bytes.pop();
        }

        Ok(Self {
            root: PathBuf::from(Self::os_string(bytes)?),
        })
    }

    pub(crate) fn root(&self) -> &Path {
        &self.root
    }

    fn git(&self) -> Command {
        let mut command = Command::new("git");
        command.current_dir(&self.root);
        command.env("GIT_LITERAL_PATHSPECS", "1");
        command
    }

    fn output(command: &mut Command) -> Result<Vec<u8>, Box<dyn Error>> {
        let output = command.output()?;
        if !output.status.success() {
            return Err(format!(
                "command failed: {command:?}: {}",
                String::from_utf8_lossy(&output.stderr)
            )
            .into());
        }
        Ok(output.stdout)
    }

    #[cfg(unix)]
    fn os_string(bytes: Vec<u8>) -> Result<OsString, Box<dyn Error>> {
        use std::os::unix::ffi::OsStringExt;
        Ok(OsString::from_vec(bytes))
    }

    #[cfg(not(unix))]
    fn os_string(bytes: Vec<u8>) -> Result<OsString, Box<dyn Error>> {
        Ok(OsString::from(String::from_utf8(bytes)?))
    }

    fn hash(&self, path: &Path) -> Result<OsString, Box<dyn Error>> {
        let mut bytes = Self::output(self.git().arg("hash-object").arg("--").arg(path))?;

        if bytes.last() == Some(&b'\n') {
            bytes.pop();
        }

        Self::os_string(bytes)
    }

    pub(crate) fn candidates(&self) -> Result<Vec<TrackedFile>, Box<dyn Error>> {
        let entries = Self::output(self.git().args(["ls-files", "--stage", "-z"]))?;

        let mut files = Vec::new();

        for record in entries
            .split(|byte| *byte == 0)
            .filter(|record| !record.is_empty())
        {
            let tab = record
                .iter()
                .position(|byte| *byte == b'\t')
                .ok_or("invalid Git index entry")?;

            let metadata = std::str::from_utf8(&record[..tab])?;
            let mut fields = metadata.split(' ');

            let mode = fields.next().ok_or("missing Git mode")?;
            let blob = OsString::from(fields.next().ok_or("missing Git blob")?);
            let stage = fields.next().ok_or("missing Git stage")?;

            if stage != "0" {
                return Err("unresolved Git conflicts".into());
            }

            if !matches!(mode, "100644" | "100755") {
                continue;
            }

            let path = PathBuf::from(Self::os_string(record[tab + 1..].to_vec())?);

            let Ok(metadata) = fs::symlink_metadata(self.root.join(&path)) else {
                continue;
            };

            if !metadata.is_file() {
                continue;
            }

            if self.hash(&path)? != blob {
                continue;
            }

            files.push(TrackedFile::new(path, blob));
        }

        Ok(files)
    }

    pub(crate) fn stage_changed(
        &self,
        files: &[TrackedFile],
        intent: ConformanceIntent,
    ) -> Result<(), Box<dyn Error>> {
        if intent != ConformanceIntent::FixConformance {
            return Ok(());
        }

        for file in files {
            if self.hash(file.path())? != *file.blob() {
                Self::output(self.git().arg("add").arg("--").arg(file.path()))?;
            }
        }

        Ok(())
    }
}
