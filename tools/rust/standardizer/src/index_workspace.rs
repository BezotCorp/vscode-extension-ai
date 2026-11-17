use crate::{
    criterion::Criterion,
    global_entry::GlobalEntry,
    global_index::GlobalIndex,
    graph_store::GraphStore,
    index::{INDEX_FILE_NAME, Index},
    index_id::IndexId,
    index_reference::IndexReference,
    intermediate_index::IntermediateIndex,
    location::Location,
    partition::Partition,
    ron_file::RonFile,
};
use std::{
    cmp::Reverse,
    collections::{BTreeMap, BTreeSet},
    error::Error,
};

struct Loaded {
    id: IndexId,
    index: Index,
    /// Criteria to register in the global index when the index is new.
    registration: Option<BTreeSet<Criterion>>,
}

/// Everything an operation changes in the indexes, ready to be persisted.
pub(crate) struct IndexChanges {
    pub(crate) indexes: Vec<(Location, Vec<u8>)>,
    pub(crate) global: GlobalIndex,
    pub(crate) global_bytes: Vec<u8>,
}

/// In-memory working copy of the index hierarchies an operation touches. Chains
/// are opened from a root down to a leaf, created when missing; `finish`
/// propagates the aggregated tags upward and prepares the global index update.
pub(crate) struct IndexWorkspace<'a> {
    store: &'a GraphStore,
    loaded: BTreeMap<Location, Loaded>,
    parents: BTreeMap<Location, Location>,
}

impl<'a> IndexWorkspace<'a> {
    pub(crate) fn new(store: &'a GraphStore) -> Self {
        Self {
            store,
            loaded: BTreeMap::new(),
            parents: BTreeMap::new(),
        }
    }

    /// Opens `root/index.ron` then one index per segment; returns the leaf location.
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
        self.load(&location, criteria.clone(), segments.is_empty(), leaf)?;
        for (depth, segment) in segments.iter().enumerate() {
            folder = folder.join(segment)?;
            let child = folder.join(INDEX_FILE_NAME)?;
            let mut shard = criteria.clone();
            shard.insert(Partition::coordinate(&segments[..=depth])?);
            self.load(&child, shard, depth + 1 == segments.len(), leaf)?;
            self.parents.insert(child.clone(), location);
            location = child;
        }
        Ok(location)
    }

    pub(crate) fn index_mut(&mut self, location: &Location) -> Result<&mut Index, Box<dyn Error>> {
        self.loaded
            .get_mut(location)
            .map(|loaded| &mut loaded.index)
            .ok_or_else(|| format!("index not opened: {location}").into())
    }

    fn load(
        &mut self,
        location: &Location,
        criteria: BTreeSet<Criterion>,
        is_leaf: bool,
        leaf: &dyn Fn(IndexId) -> Index,
    ) -> Result<(), Box<dyn Error>> {
        if self.loaded.contains_key(location) {
            return Ok(());
        }
        let loaded = match self.store.global().id_at(location) {
            Some(id) => Loaded {
                id,
                index: self.store.open(id)?,
                registration: None,
            },
            None => {
                let id = IndexId::generate();
                Loaded {
                    id,
                    index: if is_leaf {
                        leaf(id)
                    } else {
                        Index::Intermediate(IntermediateIndex::new(id))
                    },
                    registration: Some(criteria),
                }
            }
        };
        if is_leaf == matches!(loaded.index, Index::Intermediate(_)) {
            return Err(format!("index has the wrong behavior for its place: {location}").into());
        }
        self.loaded.insert(location.clone(), loaded);
        Ok(())
    }

    pub(crate) fn finish(mut self) -> Result<IndexChanges, Box<dyn Error>> {
        // Children before parents: a child is always deeper than its parent.
        let mut order: Vec<Location> = self.loaded.keys().cloned().collect();
        order.sort_by_key(|location| Reverse(location.depth()));
        for location in order {
            let Some(parent) = self.parents.get(&location).cloned() else {
                continue;
            };
            let child = self.loaded.get(&location).ok_or("missing opened index")?;
            let reference = IndexReference::new(location.clone(), child.index.tags());
            let child_id = child.id;
            let Some(Index::Intermediate(index)) =
                self.loaded.get_mut(&parent).map(|loaded| &mut loaded.index)
            else {
                return Err(format!("parent is not an intermediate index: {parent}").into());
            };
            index.reference(child_id, reference);
        }
        let mut global = self.store.global().clone();
        let mut indexes = Vec::new();
        for (location, loaded) in &self.loaded {
            if let Some(criteria) = &loaded.registration {
                global.register(
                    loaded.id,
                    GlobalEntry::new(location.clone(), criteria.clone()),
                );
            }
            indexes.push((location.clone(), RonFile::render_pretty(&loaded.index)?));
        }
        let global_bytes = RonFile::render_pretty(&global)?;
        Ok(IndexChanges {
            indexes,
            global,
            global_bytes,
        })
    }
}
