use serde::{Deserialize, Serialize};
use std::{error::Error, ffi::OsString};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum ConformanceIntent {
    CheckConformance,
    FixConformance,
}

impl ConformanceIntent {
    pub(crate) fn from_arguments(
        mut arguments: impl Iterator<Item = OsString>,
    ) -> Result<Self, Box<dyn Error>> {
        let intent = match arguments.next().as_deref().and_then(|value| value.to_str()) {
            Some("check") => Self::CheckConformance,
            Some("fix") => Self::FixConformance,
            _ => return Err("usage: standardizer <check|fix>".into()),
        };
        if arguments.next().is_some() {
            return Err("usage: standardizer <check|fix>".into());
        }
        Ok(intent)
    }
}
