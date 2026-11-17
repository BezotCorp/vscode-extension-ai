use std::fmt;

/// A store that shows signs of a previous initialization but is not in a normal state.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Anomaly {
    /// `.lock` exists but `global_index.ron` is gone.
    GlobalLost,
    /// Neither marker exists, yet the folder holds data.
    OrphanData,
}

impl fmt::Display for Anomaly {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::GlobalLost => "the store was initialized (.lock) but global_index.ron is missing",
            Self::OrphanData => {
                "neither .lock nor global_index.ron exists, but the folder holds data"
            }
        })
    }
}
