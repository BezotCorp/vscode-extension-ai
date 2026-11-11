// Projects the final output bytes in memory, then compares them before writing.

use crate::locale::Locale;
use crate::messages::Messages;
use crate::source::{DEFAULT_LOCALE, chain};
use serde::Serialize;
use std::error::Error;
use std::fs::{self, OpenOptions};
use std::io::{self, ErrorKind, Write};
use std::path::{Path, PathBuf};

const MAGIC: &[u8] = b"BZTI18N";
const VERSION: u16 = 2;

pub struct Projection {
    pub path: PathBuf,
    pub bytes: Vec<u8>,
}

pub struct Summary {
    pub unchanged: usize,
    pub changed: usize,
}

// The JSON is already in its final representation before comparison.
// BTreeMap provides deterministic key ordering.
pub fn package_nls(
    root: &Path,
    locales: &[Locale],
    locale: &Locale,
) -> Result<Projection, Box<dyn Error>> {
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

    let mut bytes = Vec::new();
    let formatter = serde_json::ser::PrettyFormatter::with_indent(b"  ");
    let mut serializer = serde_json::Serializer::with_formatter(&mut bytes, formatter);

    resolved.serialize(&mut serializer)?;
    bytes.push(b'\n');

    Ok(Projection {
        path: root.join(file),
        bytes,
    })
}

// Layout read by src/i18n/catalog.ts, all integers little-endian:
// "BZTI18N" | version u16 | count u32 | count x entry
// entry = namespace length u16 | namespace | key length u16 |
//         key | value length u32 | value (UTF-8)
//
// Regional runtime catalogs remain partial; fallback belongs to the runtime.
pub fn catalog(directory: &Path, locale: &Locale) -> Result<Projection, Box<dyn Error>> {
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

    Ok(Projection {
        path: directory.join(format!("{}.bin", locale.name)),
        bytes,
    })
}

// Read-only comparison. An absent file counts as different,
// but other filesystem errors must not be silently ignored.
fn differs(projection: &Projection) -> io::Result<bool> {
    match fs::read(&projection.path) {
        Ok(existing) => Ok(existing != projection.bytes),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(true),
        Err(error) => Err(error),
    }
}

// Write through a sibling temporary file, then rename.
// Unchanged files never reach this function.
fn persist(projection: &Projection) -> io::Result<()> {
    let path = &projection.path;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let filename = path
        .file_name()
        .ok_or_else(|| io::Error::new(ErrorKind::InvalidInput, "missing output filename"))?
        .to_string_lossy();

    for attempt in 0..100 {
        let temporary = path.with_file_name(format!(
            ".{filename}.{}.{}.tmp",
            std::process::id(),
            attempt
        ));

        let mut file = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
        {
            Ok(file) => file,
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        };

        let result = file.write_all(&projection.bytes).and_then(|_| file.flush());

        drop(file);

        if let Err(error) = result {
            let _ = fs::remove_file(&temporary);
            return Err(error);
        }

        if let Err(error) = fs::rename(&temporary, path) {
            let _ = fs::remove_file(&temporary);
            return Err(error);
        }

        return Ok(());
    }

    Err(io::Error::new(
        ErrorKind::AlreadyExists,
        format!("no available temporary filename for {}", path.display()),
    ))
}

// Check all projections before writing anything.
// Check mode never creates output files or directories.
pub fn synchronize(projections: &[Projection], check: bool) -> Result<Summary, Box<dyn Error>> {
    let mut changed = Vec::new();
    let mut unchanged = 0;

    for projection in projections {
        if differs(projection)? {
            changed.push(projection);
        } else {
            unchanged += 1;
        }
    }

    if check && !changed.is_empty() {
        let paths = changed
            .iter()
            .map(|projection| format!("  {}", projection.path.display()))
            .collect::<Vec<_>>()
            .join("\n");

        return Err(format!(
            "{} generated output(s) missing or different:\n{paths}",
            changed.len()
        )
        .into());
    }

    if !check {
        for projection in &changed {
            persist(projection)?;
        }
    }

    Ok(Summary {
        unchanged,
        changed: changed.len(),
    })
}
