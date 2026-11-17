/// Outcome of one step protecting `.lock` through Git.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ProtectionStep {
    Acquired,
    NotAcquired(String),
}

impl ProtectionStep {
    pub(crate) fn is_acquired(&self) -> bool {
        matches!(self, Self::Acquired)
    }
}
