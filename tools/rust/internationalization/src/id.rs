// Where a message lives: the same id can never be in two scopes, and a translation is checked against the same id.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum Id {
    Common(String),
    Package(String),
    Runtime { namespace: String, key: String },
}

impl Id {
    pub fn describe(&self) -> String {
        match self {
            Id::Common(key) => format!("common.\"{key}\""),
            Id::Package(key) => format!("package.\"{key}\""),
            Id::Runtime { namespace, key } => format!("extension.{namespace}.\"{key}\""),
        }
    }
}
