use crate::{
    criterion::Criterion,
    global_entry::GlobalEntry,
    graph_system::{
        INDEX_FILE_NAME, Index, IndexId, IndexReference, IntermediateIndex, OrchestratedIndex,
    },
    location::Location,
    partition::Partition,
    persistence_manager::{IndexChanges, RonFile, StorageManager},
};
use std::{
    cmp::Reverse,
    collections::{BTreeMap, BTreeSet},
    error::Error,
};

/// Coordinates every index touched by one record operation before persistence.
pub(crate) struct IndexOrchestrator<'a> {
    store: &'a StorageManager,
    indexes: BTreeMap<Location, OrchestratedIndex>,
    parents: BTreeMap<Location, Location>,
}

impl<'a> IndexOrchestrator<'a> {
    pub(crate) fn new(store: &'a StorageManager) -> Self {
        Self {
            store,
            indexes: BTreeMap::new(),
            parents: BTreeMap::new(),
        }
    }

    /// Opens `root/index.ron` then one index per segment and returns the leaf.
    /// Shards below the root get the partition coordinate as an extra criterion.
    pub(crate) fn open(
        &mut self,
        root: &Location,
        segments: &[String],
        criteria: &BTreeSet<Criterion>,
        leaf: &dyn Fn(IndexId) -> Index,
    ) -> Result<Location, Box<dyn Error>> {
        let mut folder = root.clone();
        let mut location = root.join(INDEX_FILE_NAME)?;

        self.prepare(&location, criteria.clone(), segments.is_empty(), leaf)?;

        for (depth, segment) in segments.iter().enumerate() {
            folder = folder.join(segment)?;
            let child = folder.join(INDEX_FILE_NAME)?;

            let mut shard = criteria.clone();
            shard.insert(Partition::coordinate(&segments[..=depth])?);

            self.prepare(&child, shard, depth + 1 == segments.len(), leaf)?;
            self.parents.insert(child.clone(), location);
            location = child;
        }

        Ok(location)
    }

    pub(crate) fn index_mut(&mut self, location: &Location) -> Result<&mut Index, Box<dyn Error>> {
        self.indexes
            .get_mut(location)
            .map(OrchestratedIndex::index_mut)
            .ok_or_else(|| format!("index not orchestrated: {location}").into())
    }

    /// Loads an existing index or creates the index required at this location.
    fn prepare(
        &mut self,
        location: &Location,
        criteria: BTreeSet<Criterion>,
        is_leaf: bool,
        leaf: &dyn Fn(IndexId) -> Index,
    ) -> Result<(), Box<dyn Error>> {
        if self.indexes.contains_key(location) {
            return Ok(());
        }

        let orchestrated = match self.store.global().id_at(location) {
            Some(id) => OrchestratedIndex::existing(id, self.store.open(id)?),
            None => {
                // A new index is only legitimate where nothing exists: a file already
                // there is a lost registration, not a new index.
                if self.store.contains(location) {
                    return Err(format!(
                        "index file exists but is unknown to the global index, refusing to recreate it: {location}"
                    )
                    .into());
                }
                let id = IndexId::generate();
                let index = if is_leaf {
                    leaf(id)
                } else {
                    Index::Intermediate(IntermediateIndex::new(id))
                };

                OrchestratedIndex::created(id, index, criteria)
            }
        };

        if is_leaf == matches!(orchestrated.index(), Index::Intermediate(_)) {
            return Err(format!("index has the wrong behavior for its place: {location}").into());
        }

        self.indexes.insert(location.clone(), orchestrated);
        Ok(())
    }

    /// Propagates child aggregation to parents, updates the global index and
    /// returns everything ready for persistence.
    pub(crate) fn finish(mut self) -> Result<IndexChanges, Box<dyn Error>> {
        let mut order: Vec<Location> = self.indexes.keys().cloned().collect();
        order.sort_by_key(|location| Reverse(location.depth()));

        for location in order {
            let Some(parent_location) = self.parents.get(&location).cloned() else {
                continue;
            };

            let child = self
                .indexes
                .get(&location)
                .ok_or("missing orchestrated index")?;

            let reference = IndexReference::new(location.clone(), child.index().tags());
            let child_id = child.id();

            let parent = self
                .indexes
                .get_mut(&parent_location)
                .ok_or("missing orchestrated parent index")?;

            let Index::Intermediate(index) = parent.index_mut() else {
                return Err(
                    format!("parent is not an intermediate index: {parent_location}").into(),
                );
            };

            index.reference(child_id, reference);
        }

        let mut global = self.store.global().clone();
        let mut indexes = Vec::new();

        for (location, orchestrated) in &self.indexes {
            if let Some(criteria) = orchestrated.registration() {
                global.register(
                    orchestrated.id(),
                    GlobalEntry::new(location.clone(), criteria.clone()),
                )?;
            }

            indexes.push((
                location.clone(),
                RonFile::render_pretty(orchestrated.index())?,
            ));
        }

        let global_bytes = RonFile::render_pretty(&global)?;

        Ok(IndexChanges::new(indexes, global, global_bytes))
    }
}
