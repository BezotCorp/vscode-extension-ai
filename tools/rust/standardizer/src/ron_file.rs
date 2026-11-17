use ron::ser::PrettyConfig;
use serde::{Serialize, de::DeserializeOwned};
use std::{error::Error, fs, path::Path};

pub(crate) struct RonFile;

impl RonFile {
    pub(crate) fn read<T: DeserializeOwned>(path: &Path) -> Result<T, Box<dyn Error>> {
        let content =
            fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))?;
        ron::from_str(&content).map_err(|error| format!("{}: {error}", path.display()).into())
    }

    /// One line, like record files.
    pub(crate) fn render_compact<T: Serialize>(value: &T) -> Result<Vec<u8>, Box<dyn Error>> {
        let mut text = ron::to_string(value)?;
        text.push('\n');
        Ok(text.into_bytes())
    }

    /// Multi-line, like index files.
    pub(crate) fn render_pretty<T: Serialize>(value: &T) -> Result<Vec<u8>, Box<dyn Error>> {
        let mut text = ron::ser::to_string_pretty(value, PrettyConfig::default())?;
        text.push('\n');
        Ok(text.into_bytes())
    }
}
