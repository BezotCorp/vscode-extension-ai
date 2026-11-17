use crate::{
    criterion::Criterion,
    data_placement::DataPlacementOrchestrator,
    graph_system::{INDEX_FILE_NAME, Index, IndexId, Indexable},
    id_uuid_v7::IdUuidV7,
    location::Location,
    partition::Partition,
    tag_id::TagId,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    error::Error,
    path::Path,
};

/// Reads the graph through the placement orchestrator: which indexes to consult,
/// how to traverse them, and the rules a stored graph must satisfy. It decides
/// nothing about where or how data lives.
pub(crate) struct GraphReader<'a> {
    placement: &'a DataPlacementOrchestrator,
}

impl<'a> GraphReader<'a> {
    pub(crate) fn new(placement: &'a DataPlacementOrchestrator) -> Self {
        Self { placement }
    }

    /// Opens an existing store and verifies its graph before handing it over.
    pub(crate) fn open(directory: &Path) -> Result<DataPlacementOrchestrator, Box<dyn Error>> {
        let placement = DataPlacementOrchestrator::load(directory)?;
        GraphReader::new(&placement).verify()?;
        Ok(placement)
    }

    /// An index by identity, through the global index.
    pub(crate) fn index(&self, id: IndexId) -> Result<Index, Box<dyn Error>> {
        let entry = self
            .placement
            .global()
            .get(id)
            .ok_or_else(|| format!("index unknown to the global index: {id}"))?;
        let index: Index = self.placement.read(entry.location())?;
        if index.id() != id {
            return Err(format!(
                "index identity differs from the global index: {}",
                entry.location()
            )
            .into());
        }
        Ok(index)
    }

    /// File of the record `id`, through the id indexes matching `criteria` and
    /// the shard its identity routes to.
    pub(crate) fn locate(
        &self,
        criteria: &BTreeSet<Criterion>,
        partition: Partition,
        id: IdUuidV7,
    ) -> Result<Option<Location>, Box<dyn Error>> {
        for (index, _) in self.shards(criteria, partition, id)? {
            if let Index::Id(ids) = self.index(index)?
                && let Some(location) = ids.entries().get(&id)
            {
                return Ok(Some(location.clone()));
            }
        }
        Ok(None)
    }

    /// Records referencing `referenced`, through the reference indexes matching `criteria`.
    pub(crate) fn referrers(
        &self,
        criteria: &BTreeSet<Criterion>,
        partition: Partition,
        referenced: IdUuidV7,
    ) -> Result<Vec<(IdUuidV7, Location)>, Box<dyn Error>> {
        let mut found = Vec::new();
        for (index, _) in self.shards(criteria, partition, referenced)? {
            if let Index::Reference(references) = self.index(index)?
                && let Some(referrers) = references.entries().get(&referenced)
            {
                found.extend(
                    referrers
                        .iter()
                        .map(|(id, location)| (*id, location.clone())),
                );
            }
        }
        Ok(found)
    }

    fn shards(
        &self,
        criteria: &BTreeSet<Criterion>,
        partition: Partition,
        key: IdUuidV7,
    ) -> Result<Vec<(IndexId, Location)>, Box<dyn Error>> {
        let mut query = criteria.clone();
        query.insert(Partition::coordinate(&partition.segments(key)?)?);
        Ok(self
            .placement
            .global()
            .find(&query)
            .into_iter()
            .map(|(id, entry)| (id, entry.location().clone()))
            .collect())
    }

    /// Every record carrying `tag`. The global index orients toward the physical
    /// hierarchies matching `criteria`; their aggregated tags then prune the descent.
    pub(crate) fn records_tagged<R: Indexable>(
        &self,
        criteria: &BTreeSet<Criterion>,
        tag: &TagId,
    ) -> Result<Vec<R>, Box<dyn Error>> {
        let matches = self.placement.global().find(criteria);
        let locations: BTreeSet<&Location> =
            matches.iter().map(|(_, entry)| entry.location()).collect();
        let mut records = Vec::new();
        for (id, entry) in &matches {
            // A root is a match whose parent folder index is not itself a match.
            let parent = entry
                .location()
                .directory()
                .and_then(|folder| folder.directory())
                .and_then(|folder| folder.join(INDEX_FILE_NAME).ok());
            if parent.is_none_or(|parent| !locations.contains(&parent)) {
                self.collect(*id, tag, &mut records)?;
            }
        }
        Ok(records)
    }

    fn collect<R: Indexable>(
        &self,
        index: IndexId,
        tag: &TagId,
        records: &mut Vec<R>,
    ) -> Result<(), Box<dyn Error>> {
        match self.index(index)? {
            Index::Intermediate(intermediate) => {
                for (child, reference) in intermediate.children() {
                    if reference.tags().contains(tag) {
                        self.collect(*child, tag, records)?;
                    }
                }
            }
            Index::Terminal(terminal) => {
                let folder = self
                    .placement
                    .global()
                    .get(index)
                    .and_then(|entry| entry.location().directory())
                    .ok_or("index without folder")?;
                for (id, tags) in terminal.entries() {
                    if !tags.contains(tag) {
                        continue;
                    }
                    let record: R = self.placement.read(&folder.join(&id.file_name())?)?;
                    if record.id() != *id || record.tags() != tags {
                        return Err(format!("stale index entry for record {id}").into());
                    }
                    records.push(record);
                }
            }
            Index::Id(_) | Index::Reference(_) => {}
        }
        Ok(())
    }

    fn check_registered(&self, tags: &BTreeSet<TagId>) -> Result<(), Box<dyn Error>> {
        if tags.iter().any(|tag| !self.placement.tags().contains(tag)) {
            return Err("unregistered tag reference".into());
        }
        Ok(())
    }

    /// Consistency of what the global index declares, read index by index.
    fn verify(&self) -> Result<(), Box<dyn Error>> {
        let mut index_tags: BTreeMap<IndexId, BTreeSet<TagId>> = BTreeMap::new();
        let mut index_locations: BTreeMap<Location, IndexId> = BTreeMap::new();
        let mut children = Vec::new();
        let mut records: BTreeMap<IdUuidV7, Location> = BTreeMap::new();
        let mut located: BTreeMap<IdUuidV7, Location> = BTreeMap::new();
        let mut referrers = Vec::new();
        for (id, entry) in self.placement.global().iter() {
            let location = entry.location();
            if location.file_name() != Some(INDEX_FILE_NAME.as_ref())
                || location.directory().is_none()
                || entry.criteria().is_empty()
            {
                return Err(format!("invalid index entry: {location}").into());
            }
            if let Some(existing) = index_locations.insert(location.clone(), id) {
                return Err(format!(
                    "index location belongs to several identities: {location} ({existing} and {id})"
                )
                .into());
            }

            let index = self.index(id)?;
            let tags = index.tags();
            self.check_registered(&tags)?;
            if tags != index.aggregate() {
                return Err(format!("stale aggregated tags: {location}").into());
            }
            index_tags.insert(id, tags);
            match &index {
                Index::Terminal(terminal) => {
                    let folder = location.directory().ok_or("index without folder")?;
                    for (record, entry_tags) in terminal.entries() {
                        self.check_registered(entry_tags)?;
                        let file = folder.join(&record.file_name())?;
                        if !self.placement.contains_file(&file) {
                            return Err(format!("missing record file: {file}").into());
                        }
                        if records.insert(*record, file).is_some() {
                            return Err(format!("record indexed twice: {record}").into());
                        }
                    }
                }
                Index::Intermediate(intermediate) => {
                    for (child, reference) in intermediate.children() {
                        children.push((id, *child, reference.clone()));
                    }
                }
                Index::Id(ids) => {
                    for (record, location) in ids.entries() {
                        if located.insert(*record, location.clone()).is_some() {
                            return Err(
                                format!("record indexed by UUID several times: {record}").into()
                            );
                        }
                    }
                }
                Index::Reference(references) => {
                    for by_referrer in references.entries().values() {
                        referrers.extend(by_referrer.iter().map(|(r, l)| (*r, l.clone())));
                    }
                }
            }
        }
        let mut parents: BTreeMap<IndexId, IndexId> = BTreeMap::new();
        for (parent, child, reference) in &children {
            let entry = self
                .placement
                .global()
                .get(*child)
                .ok_or_else(|| format!("child unknown to the global index: {child}"))?;
            let parent_location = self
                .placement
                .global()
                .get(*parent)
                .map(|entry| entry.location());
            if entry.location() != reference.location()
                || index_tags.get(child) != Some(reference.tags())
            {
                return Err(format!("stale child reference: {}", reference.location()).into());
            }
            let nested = reference
                .location()
                .directory()
                .and_then(|folder| folder.directory());
            if nested.as_ref()
                != parent_location
                    .and_then(|location| location.directory())
                    .as_ref()
            {
                return Err(format!(
                    "child not nested under its parent: {}",
                    reference.location()
                )
                .into());
            }
            if parents.insert(*child, *parent).is_some() {
                return Err(format!("index with several parents: {child}").into());
            }
        }
        for (record, location) in &located {
            if records.get(record) != Some(location) {
                return Err(
                    format!("categorical index points to an unknown record: {record}").into(),
                );
            }
        }

        for (record, location) in &referrers {
            if records.get(record) != Some(location) {
                return Err(
                    format!("categorical index points to an unknown record: {record}").into(),
                );
            }
        }

        for (record, location) in &records {
            match located.get(record) {
                Some(indexed) if indexed == location => {}
                Some(indexed) => {
                    return Err(format!(
                        "UUID index points to the wrong location for {record}: {indexed} instead of {location}"
                    )
                    .into());
                }
                None => {
                    return Err(format!("record missing from UUID index: {record}").into());
                }
            }
        }
        // Every parent chain must end at a root: no index may belong to a cycle.
        let limit = self.placement.global().iter().count();
        for start in parents.keys() {
            let mut current = start;
            let mut steps = 0;
            while let Some(parent) = parents.get(current) {
                current = parent;
                steps += 1;
                if steps > limit {
                    return Err("cyclic index hierarchy".into());
                }
            }
        }
        Ok(())
    }
}
