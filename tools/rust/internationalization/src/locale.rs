use crate::source::Source;

pub struct Locale {
    pub name: String,
    pub source: Source,
}

impl Locale {
    // "fr-CA" -> Some("fr"); "fr" and "en" have no base.
    pub fn base(&self) -> Option<&str> {
        self.name.split_once('-').map(|(base, _)| base)
    }
}
