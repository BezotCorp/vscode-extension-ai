use serde::Deserialize;

const YEAR_2015: &str = "2015";
const YEAR_2018: &str = "2018";
const YEAR_2021: &str = "2021";
const YEAR_2024: &str = "2024";

#[derive(Clone, Copy, Deserialize)]
pub(crate) enum RustEdition {
    #[serde(rename = "2015")]
    Rust2015,
    #[serde(rename = "2018")]
    Rust2018,
    #[serde(rename = "2021")]
    Rust2021,
    #[serde(rename = "2024")]
    Rust2024,
}

impl RustEdition {
    pub(crate) fn argument(self) -> &'static str {
        match self {
            Self::Rust2015 => YEAR_2015,
            Self::Rust2018 => YEAR_2018,
            Self::Rust2021 => YEAR_2021,
            Self::Rust2024 => YEAR_2024,
        }
    }
}
