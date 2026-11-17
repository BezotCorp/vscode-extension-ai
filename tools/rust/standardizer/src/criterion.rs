use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, error::Error, fmt};

/// Keyword steering a search toward the indexes able to answer it. Distinct from
/// business tags: criteria only exist in the global index.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(try_from = "String", into = "String")]
pub(crate) struct Criterion(String);

impl Criterion {
    pub(crate) fn set(names: &[&str]) -> Result<BTreeSet<Self>, Box<dyn Error>> {
        names
            .iter()
            .map(|name| Self::try_from((*name).to_owned()).map_err(Into::into))
            .collect()
    }
}

impl TryFrom<String> for Criterion {
    type Error = String;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        if value.is_empty()
            || !value
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        {
            return Err(format!("invalid criterion: {value:?}"));
        }
        Ok(Self(value))
    }
}

impl From<Criterion> for String {
    fn from(value: Criterion) -> Self {
        value.0
    }
}

impl fmt::Display for Criterion {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}
