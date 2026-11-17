use serde::{Deserialize, Serialize};

/// Behavior of a categorical index created next to the data.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub(crate) enum LookupKind {
    /// UUID of the record → its file.
    Id,
    /// UUID referenced by the record → the records referencing it.
    Reference,
}
