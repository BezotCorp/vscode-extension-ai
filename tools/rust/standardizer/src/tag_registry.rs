use crate::tag_id::TagId;
use serde::Deserialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    error::Error,
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TagRegistry {
    tags: BTreeMap<String, TagId>,
}

impl TagRegistry {
    pub(crate) fn validate(&self) -> Result<(), Box<dyn Error>> {
        let mut ids = BTreeSet::new();
        for (name, id) in &self.tags {
            if name.is_empty()
                || name.trim() != name
                || name.to_lowercase() != *name
                || !ids.insert(id)
            {
                return Err("noncanonical or duplicate tag".into());
            }
        }
        Ok(())
    }

    pub(crate) fn find(&self, name: &str) -> Result<TagId, Box<dyn Error>> {
        self.tags
            .get(name)
            .copied()
            .ok_or_else(|| format!("missing tag: {name}").into())
    }

    pub(crate) fn contains(&self, id: &TagId) -> bool {
        self.tags.values().any(|value| value == id)
    }
}
