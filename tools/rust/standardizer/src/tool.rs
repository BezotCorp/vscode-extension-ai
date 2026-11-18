use serde::Deserialize;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum Tool {
    Rustfmt,
    Biome,
}
