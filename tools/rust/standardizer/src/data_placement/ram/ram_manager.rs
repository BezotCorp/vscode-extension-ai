use std::{
    any::{Any, TypeId},
    collections::HashMap,
    hash::Hash,
};

/// Owns typed values resident in system RAM.
///
/// The caller identifies each value. The manager does not
/// perform persistence or filesystem operations.
pub(crate) struct RamManager<K> {
    values: HashMap<K, HashMap<TypeId, Box<dyn Any>>>,
}

impl<K: Eq + Hash> RamManager<K> {
    pub(crate) fn new() -> Self {
        Self {
            values: HashMap::new(),
        }
    }

    pub(crate) fn insert<T: 'static>(&mut self, key: K, value: T) -> Option<T> {
        self.values
            .entry(key)
            .or_default()
            .insert(TypeId::of::<T>(), Box::new(value))
            .map(|previous| {
                *previous
                    .downcast::<T>()
                    .expect("RAM entry type must match its type identifier")
            })
    }

    pub(crate) fn get<T: 'static>(&self, key: &K) -> Option<&T> {
        self.values
            .get(key)?
            .get(&TypeId::of::<T>())?
            .downcast_ref::<T>()
    }

    pub(crate) fn get_mut<T: 'static>(&mut self, key: &K) -> Option<&mut T> {
        self.values
            .get_mut(key)?
            .get_mut(&TypeId::of::<T>())?
            .downcast_mut::<T>()
    }

    pub(crate) fn remove<T: 'static>(&mut self, key: &K) -> Option<T> {
        let entries = self.values.get_mut(key)?;
        let value = entries.remove(&TypeId::of::<T>())?;

        if entries.is_empty() {
            self.values.remove(key);
        }

        Some(
            *value
                .downcast::<T>()
                .expect("RAM entry type must match its type identifier"),
        )
    }

    pub(crate) fn contains<T: 'static>(&self, key: &K) -> bool {
        self.values
            .get(key)
            .is_some_and(|entries| entries.contains_key(&TypeId::of::<T>()))
    }

    pub(crate) fn clear(&mut self) {
        self.values.clear();
    }
}
