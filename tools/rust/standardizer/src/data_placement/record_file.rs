use crate::location::Location;

/// A record to persist together with its index changes: created at, or
/// replacing the file at, a location.
pub(crate) enum RecordFile<'a, R> {
    Create(Location, &'a R),
    Replace(Location, &'a R),
}

impl<'a, R> RecordFile<'a, R> {
    pub(crate) fn create(location: Location, record: &'a R) -> Self {
        Self::Create(location, record)
    }

    pub(crate) fn replace(location: Location, record: &'a R) -> Self {
        Self::Replace(location, record)
    }
}
