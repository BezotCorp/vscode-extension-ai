// Writes what the extension reads: package.nls*.json and dist/i18n/<locale>.bin.

use crate::source::{DEFAULT_LOCALE, Locale, Messages, chain};
use std::error::Error;
use std::fs;
use std::path::Path;

const MAGIC: &[u8] = b"BZTI18N";
const VERSION: u16 = 2;

// package.nls.json is the default locale; the others follow the lowercase names VS Code looks for.
// A regional file holds the whole manifest, resolved through its base language and the default locale.
pub fn write_package_nls(
    root: &Path,
    locales: &[Locale],
    locale: &Locale,
) -> Result<(), Box<dyn Error>> {
    let file = if locale.name == DEFAULT_LOCALE {
        "package.nls.json".to_string()
    } else {
        format!("package.nls.{}.json", locale.name.to_lowercase())
    };
    let mut resolved = Messages::new();

    for step in chain(locales, &locale.name) {
        resolved.extend(step.source.common.clone());
        resolved.extend(step.source.package.clone());
    }

    let mut json = serde_json::to_string_pretty(&resolved)?;

    json.push('\n');
    fs::write(root.join(file), json)?;

    Ok(())
}

// Layout read by src/i18n/catalog.ts, all integers little-endian:
//   "BZTI18N" | version u16 | count u32 | count x entry
//   entry = namespace length u16 | namespace | key length u16 | key | value length u32 | value   (UTF-8)
// A catalog only holds the messages of its own locale: a regional one is partial, the runtime falls back.
pub fn write_catalog(directory: &Path, locale: &Locale) -> Result<(), Box<dyn Error>> {
    let runtime = locale.source.runtime();
    let mut bytes = Vec::new();

    bytes.extend_from_slice(MAGIC);
    bytes.extend_from_slice(&VERSION.to_le_bytes());
    bytes.extend_from_slice(&u32::try_from(runtime.len())?.to_le_bytes());

    for ((namespace, key), value) in runtime {
        bytes.extend_from_slice(&u16::try_from(namespace.len())?.to_le_bytes());
        bytes.extend_from_slice(namespace.as_bytes());
        bytes.extend_from_slice(&u16::try_from(key.len())?.to_le_bytes());
        bytes.extend_from_slice(key.as_bytes());
        bytes.extend_from_slice(&u32::try_from(value.len())?.to_le_bytes());
        bytes.extend_from_slice(value.as_bytes());
    }

    fs::create_dir_all(directory)?;
    fs::write(directory.join(format!("{}.bin", locale.name)), bytes)?;

    Ok(())
}
