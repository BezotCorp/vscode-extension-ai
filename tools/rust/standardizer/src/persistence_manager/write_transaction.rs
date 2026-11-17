use std::{
    error::Error,
    fs, io,
    path::{Path, PathBuf},
};

use super::undo::Undo;

/// Local filesystem changes that can be reverted together. Every change is
/// journaled in memory once applied; `rollback` restores the previous state.
pub(crate) struct WriteTransaction {
    undo: Vec<Undo>,
}

impl WriteTransaction {
    pub(crate) fn begin() -> Self {
        Self { undo: Vec::new() }
    }

    /// Creates `path` and the missing ancestors, remembering which ones are new.
    pub(crate) fn create_directories(&mut self, path: &Path) -> Result<(), Box<dyn Error>> {
        let mut missing = Vec::new();
        let mut current = Some(path);
        while let Some(directory) = current.filter(|directory| !directory.exists()) {
            missing.push(directory);
            current = directory.parent();
        }
        for directory in missing.into_iter().rev() {
            fs::create_dir(directory)
                .map_err(|error| format!("{}: {error}", directory.display()))?;
            self.undo
                .push(Undo::RemoveDirectory(directory.to_path_buf()));
        }
        Ok(())
    }

    /// Writes a file that must not exist yet.
    pub(crate) fn create_file(&mut self, path: &Path, bytes: &[u8]) -> Result<(), Box<dyn Error>> {
        if path.exists() {
            return Err(format!("file already exists: {}", path.display()).into());
        }
        self.write_atomically(path, bytes)?;
        self.undo.push(Undo::RemoveFile(path.to_path_buf()));
        Ok(())
    }

    /// Replaces the content of a file, or creates it.
    pub(crate) fn replace_file(&mut self, path: &Path, bytes: &[u8]) -> Result<(), Box<dyn Error>> {
        let previous = match fs::read(path) {
            Ok(previous) => Some(previous),
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("{}: {error}", path.display()).into()),
        };
        if previous.as_deref() == Some(bytes) {
            return Ok(());
        }
        self.write_atomically(path, bytes)?;
        self.undo.push(match previous {
            Some(previous) => Undo::RestoreFile {
                path: path.to_path_buf(),
                previous,
            },
            None => Undo::RemoveFile(path.to_path_buf()),
        });
        Ok(())
    }

    fn write_atomically(&self, path: &Path, bytes: &[u8]) -> Result<(), Box<dyn Error>> {
        let mut temporary = path.as_os_str().to_owned();
        temporary.push(".tmp");
        let temporary = PathBuf::from(temporary);
        let result = fs::File::create(&temporary)
            .and_then(|mut file| {
                io::Write::write_all(&mut file, bytes)?;
                file.sync_all()
            })
            .and_then(|()| fs::rename(&temporary, path));
        if let Err(error) = result {
            let _ = fs::remove_file(&temporary);
            return Err(format!("{}: {error}", path.display()).into());
        }
        Ok(())
    }

    pub(crate) fn rollback(self) -> Result<(), String> {
        let mut failures = Vec::new();

        for undo in self.undo.into_iter().rev() {
            let path = undo.path().to_path_buf();

            if let Err(error) = undo.rollback() {
                failures.push(format!("{}: {error}", path.display()));
            }
        }

        if failures.is_empty() {
            Ok(())
        } else {
            Err(failures.join("; "))
        }
    }

    pub(crate) fn commit(self) {}
}
