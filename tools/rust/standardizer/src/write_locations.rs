use crate::{tag_id::TagId, tag_registry::TagRegistry, write_destination::WriteDestination};
use serde::Deserialize;
use std::{collections::BTreeSet, error::Error};

/// Persisted configuration of where new data may be created, by tag.
/// Separate from the global index, which only says where existing indexes are.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct WriteLocations {
    destinations: Vec<WriteDestination>,
}

impl WriteLocations {
    pub(crate) fn validate(&self, registry: &TagRegistry) -> Result<(), Box<dyn Error>> {
        let mut seen = BTreeSet::new();
        for destination in &self.destinations {
            if !registry.contains(destination.tag()) || !seen.insert(*destination.tag()) {
                return Err("unregistered or duplicate write destination tag".into());
            }
            if destination.criteria().is_empty()
                || destination
                    .lookups()
                    .iter()
                    .any(|lookup| lookup.criteria().is_empty())
            {
                return Err("write destination without criteria".into());
            }
        }
        Ok(())
    }

    /// The tags marking a domain: they never propagate to other objects.
    pub(crate) fn structural_tags(&self) -> BTreeSet<TagId> {
        self.destinations.iter().map(|d| *d.tag()).collect()
    }

    pub(crate) fn for_tag(&self, tag: &TagId) -> Result<&WriteDestination, Box<dyn Error>> {
        self.destinations
            .iter()
            .find(|destination| destination.tag() == tag)
            .ok_or_else(|| "no write destination for this domain tag".into())
    }

    /// The single destination whose tag is carried by the data.
    pub(crate) fn select(
        &self,
        tags: &BTreeSet<TagId>,
    ) -> Result<&WriteDestination, Box<dyn Error>> {
        let mut matches = self
            .destinations
            .iter()
            .filter(|destination| tags.contains(destination.tag()));
        match (matches.next(), matches.next()) {
            (Some(destination), None) => Ok(destination),
            (None, _) => Err("no write destination for these tags".into()),
            _ => Err("several write destinations for these tags".into()),
        }
    }
}
