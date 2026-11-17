use crate::location::Location;

/// Record file operation applied together with its index changes.
pub(crate) enum RecordFile {
    Create(Location, Vec<u8>),
    Replace(Location, Vec<u8>),
}

impl RecordFile {
    pub(crate) fn create(location: Location, bytes: Vec<u8>) -> Self {
        Self::Create(location, bytes)
    }

    pub(crate) fn replace(location: Location, bytes: Vec<u8>) -> Self {
        Self::Replace(location, bytes)
    }

    pub(crate) fn parts(&self) -> (&Location, &[u8], bool) {
        match self {
            Self::Create(location, bytes) => (location, bytes, true),
            Self::Replace(location, bytes) => (location, bytes, false),
        }
    }
}
