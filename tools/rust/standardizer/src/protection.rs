use crate::protection_step::ProtectionStep;

/// What Git protection of `.lock` was obtained: locally committed, then published.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Protection {
    versioning: ProtectionStep,
    publication: ProtectionStep,
}

impl Protection {
    pub(crate) fn new(versioning: ProtectionStep, publication: ProtectionStep) -> Self {
        Self {
            versioning,
            publication,
        }
    }

    pub(crate) fn versioning(&self) -> &ProtectionStep {
        &self.versioning
    }

    #[cfg(test)]
    pub(crate) fn publication(&self) -> &ProtectionStep {
        &self.publication
    }

    pub(crate) fn describe(&self) -> Vec<String> {
        let mut lines = Vec::new();
        for (name, step) in [
            ("local commit", &self.versioning),
            ("remote publication", &self.publication),
        ] {
            lines.push(match step {
                ProtectionStep::Acquired => format!("{name}: done"),
                ProtectionStep::NotAcquired(reason) => {
                    format!("{name}: NOT acquired ({reason}); run `standardizer protect` to finish")
                }
            });
        }
        lines
    }
}
