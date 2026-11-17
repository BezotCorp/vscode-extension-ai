use crate::{id_uuid_v7::IdUuidV7, tag_id::TagId};
use serde::{Serialize, de::DeserializeOwned};
use std::collections::BTreeSet;

/// A persisted object: identified by a UUIDv7, carrying its real tags, possibly
/// referencing other objects. The generic index machinery only relies on this.
pub(crate) trait Indexable: Serialize + DeserializeOwned {
    fn id(&self) -> IdUuidV7;
    fn tags(&self) -> &BTreeSet<TagId>;
    /// Identities this object points to, indexed so they can be found backwards.
    fn references(&self) -> BTreeSet<IdUuidV7>;
}
