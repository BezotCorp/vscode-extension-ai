use std::fmt;

/// A store that shows signs of a previous initialization but is not in a normal state.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Anomaly {
    /// `.lock` exists but `global_index.ron` is gone.
    GlobalLost,
    /// `.lock` is gone but Git proves it existed.
    LockLost,
    /// Neither marker exists, yet the folder holds data.
    OrphanData,
    /// Folder empty, but Git history shows a store lived there.
    LostSystemHistory,
}

impl fmt::Display for Anomaly {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::GlobalLost => "the store was initialized (.lock) but global_index.ron is missing",
            Self::LockLost => {
                "the store was initialized: Git history proves .lock existed, but it is missing; \
                 restore it from Git, this is not a new system"
            }
            Self::OrphanData => {
                "neither .lock nor global_index.ron exists, but the folder holds data"
            }
            Self::LostSystemHistory => {
                "the folder is empty but Git history shows a store lived there"
            }
        })
    }
}
