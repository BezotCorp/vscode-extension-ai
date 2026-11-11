// The translation sources: data/i18n/<locale>.ron, and what can be derived from them.
use crate::id::Id;
use crate::locale::Locale;
use crate::messages::Messages;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};

pub const DEFAULT_LOCALE: &str = "en";

// At runtime, the strings of `common` live in this namespace, next to the `global` strings of `extension`.
pub const GLOBAL_NAMESPACE: &str = "global";

// One RON file.
//   common    -> package.nls*.json and the runtime catalog (namespace "global")
//   package   -> package.nls*.json only
//   extension -> the runtime catalog only: namespace -> key -> value
#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct Source {
    #[serde(default)]
    pub common: Messages,
    #[serde(default)]
    pub package: Messages,
    #[serde(default)]
    pub extension: BTreeMap<String, Messages>,
}

impl Source {
    pub fn entries(&self) -> BTreeMap<Id, &String> {
        let mut entries = BTreeMap::new();

        for (key, value) in &self.common {
            entries.insert(Id::Common(key.clone()), value);
        }

        for (key, value) in &self.package {
            entries.insert(Id::Package(key.clone()), value);
        }

        for (namespace, messages) in &self.extension {
            for (key, value) in messages {
                entries.insert(
                    Id::Runtime {
                        namespace: namespace.clone(),
                        key: key.clone(),
                    },
                    value,
                );
            }
        }

        entries
    }

    // What the extension reads at runtime: (namespace, key) -> value.
    pub fn runtime(&self) -> BTreeMap<(String, String), &String> {
        let mut catalog = BTreeMap::new();

        for (key, value) in &self.common {
            catalog.insert((GLOBAL_NAMESPACE.to_string(), key.clone()), value);
        }

        for (namespace, messages) in &self.extension {
            for (key, value) in messages {
                catalog.insert((namespace.clone(), key.clone()), value);
            }
        }

        catalog
    }
}

pub fn load(directory: &Path) -> Result<Vec<Locale>, Box<dyn Error>> {
    let mut files: Vec<PathBuf> = fs::read_dir(directory)
        .map_err(|error| format!("cannot read {}: {error}", directory.display()))?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.extension().is_some_and(|extension| extension == "ron"))
        .filter(|path| path.file_stem().is_some_and(|stem| stem != "namespaces"))
        .collect();

    files.sort();

    let mut locales = Vec::new();

    for file in files {
        let name = file
            .file_stem()
            .and_then(|stem| stem.to_str())
            .ok_or("invalid locale file name")?
            .to_string();
        let text = fs::read_to_string(&file)?;
        let value: ron::Value =
            ron::de::from_str(&text).map_err(|error| format!("{}: {error}", file.display()))?;
        let source: Source = value
            .into_rust()
            .map_err(|error| format!("{}: {error}", file.display()))?;

        locales.push(Locale { name, source });
    }

    if locales.is_empty() {
        return Err(format!("no .ron file in {}", directory.display()).into());
    }

    Ok(locales)
}

// The locales a lookup walks through, most specific last: ["en", "fr", "fr-CA"].
pub fn chain<'a>(locales: &'a [Locale], name: &str) -> Vec<&'a Locale> {
    let mut names = vec![DEFAULT_LOCALE];

    if let Some((base, _)) = name.split_once('-') {
        names.push(base);
    }

    names.push(name);
    names.dedup();

    names
        .into_iter()
        .filter_map(|wanted| locales.iter().find(|locale| locale.name == wanted))
        .collect()
}
