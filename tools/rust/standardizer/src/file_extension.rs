use serde::{Deserialize, Serialize};
use std::ffi::OsStr;

#[derive(Clone, Deserialize, Serialize)]
#[serde(try_from = "String", into = "String")]
pub(crate) struct FileExtension(String);

impl FileExtension {
    pub(crate) fn as_os_str(&self) -> &OsStr {
        OsStr::new(&self.0)
    }
}

impl TryFrom<String> for FileExtension {
    type Error = &'static str;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        if value.is_empty() || value.contains(['.', '/', '\\', '\0']) {
            return Err("expected a nonempty file extension without dot or path separator");
        }
        Ok(Self(value))
    }
}

impl From<FileExtension> for String {
    fn from(value: FileExtension) -> Self {
        value.0
    }
}
