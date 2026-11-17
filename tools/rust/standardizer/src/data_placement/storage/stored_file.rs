use crate::location::Location;

/// A file ready to be written on the storage: rendered bytes at a location,
/// to be created or to replace what exists.
pub(crate) struct StoredFile {
    location: Location,
    bytes: Vec<u8>,
    create: bool,
}

impl StoredFile {
    pub(crate) fn create(location: Location, bytes: Vec<u8>) -> Self {
        Self {
            location,
            bytes,
            create: true,
        }
    }

    pub(crate) fn replace(location: Location, bytes: Vec<u8>) -> Self {
        Self {
            location,
            bytes,
            create: false,
        }
    }

    pub(crate) fn location(&self) -> &Location {
        &self.location
    }

    pub(crate) fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    pub(crate) fn creates(&self) -> bool {
        self.create
    }
}
