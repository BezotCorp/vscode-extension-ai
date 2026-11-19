use crate::{Result, invalid, state};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

const MAX_RESOURCE: u64 = 32 * 1024 * 1024;

const REQUIRED: [&str; 6] = [
    "extension/package.nls.json",
    "extension/package.nls.fr.json",
    "extension/dist/extension.js",
    "extension/dist/i18n/catalog.js",
    "extension/data/i18n/output/en.bin",
    "extension/data/i18n/output/fr.bin",
];

pub(crate) struct Package {
    pub(crate) target: String,
    pub(crate) digest: [u8; 32],
    pub(crate) translations: BTreeMap<String, [u8; 32]>,
}

pub(crate) fn packages(directory: &Path) -> Result<Vec<PathBuf>> {
    let mut found = Vec::new();

    for entry in fs::read_dir(directory)? {
        let entry = entry?;

        if entry.file_type()?.is_file() && entry.path().extension().is_some_and(|ext| ext == "vsix")
        {
            found.push(entry.path());
        }
    }

    found.sort();
    Ok(found)
}

fn read_entry(archive: &mut ZipArchive<fs::File>, name: &str) -> Result<Vec<u8>> {
    let entry = archive.by_name(name)?;

    if entry.size() > MAX_RESOURCE {
        return Err(invalid(format!("Oversized VSIX resource: {name}")).into());
    }

    let mut data = Vec::new();
    entry.take(MAX_RESOURCE + 1).read_to_end(&mut data)?;

    if data.len() as u64 > MAX_RESOURCE {
        return Err(invalid(format!("Oversized VSIX resource: {name}")).into());
    }

    Ok(data)
}

fn catalog(bytes: &[u8]) -> Result<()> {
    if bytes.len() < 13
        || !bytes.starts_with(b"BZTI18N")
        || u16::from_le_bytes([bytes[7], bytes[8]]) != 2
    {
        return Err(invalid("Invalid translation catalog header").into());
    }

    let count = u32::from_le_bytes(bytes[9..13].try_into()?);
    let mut cursor = 13usize;

    for _ in 0..count {
        for width in [2usize, 2, 4] {
            let head = bytes
                .get(cursor..cursor + width)
                .ok_or_else(|| invalid("Truncated catalog length"))?;

            let length = if width == 2 {
                u16::from_le_bytes(head.try_into()?) as usize
            } else {
                u32::from_le_bytes(head.try_into()?) as usize
            };

            cursor += width;

            let end = cursor
                .checked_add(length)
                .ok_or_else(|| invalid("Catalog length overflow"))?;

            let field = bytes
                .get(cursor..end)
                .ok_or_else(|| invalid("Truncated catalog value"))?;

            std::str::from_utf8(field)?;
            cursor = end;
        }
    }

    if cursor != bytes.len() {
        return Err(invalid("Trailing catalog bytes").into());
    }

    Ok(())
}

pub(crate) fn verify(path: &Path, manifest: &Value) -> Result<Package> {
    let mut archive = ZipArchive::new(fs::File::open(path)?)?;

    if archive.len() > 20_000 {
        return Err(invalid("Too many VSIX entries").into());
    }

    // Reject duplicate critical entries before reading by name.
    for required in REQUIRED
        .iter()
        .copied()
        .chain(["extension.vsixmanifest", "extension/package.json"])
    {
        let mut matches = 0;

        for index in 0..archive.len() {
            if archive.by_index(index)?.name()? == required {
                matches += 1;
            }
        }

        if matches != 1 {
            return Err(invalid(format!("Missing or duplicated VSIX entry: {required}")).into());
        }
    }

    let xml = String::from_utf8(read_entry(&mut archive, "extension.vsixmanifest")?)?;

    let document = roxmltree::Document::parse(&xml)?;
    let identity = document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "Identity")
        .ok_or_else(|| invalid("Missing VSIX identity"))?;

    let target = identity
        .attribute("TargetPlatform")
        .ok_or_else(|| invalid("Missing VSIX target"))?
        .to_owned();

    let version = identity
        .attribute("Version")
        .ok_or_else(|| invalid("Missing VSIX version"))?;

    let identity_name = identity
        .attribute("Id")
        .ok_or_else(|| invalid("Missing VSIX identity name"))?;
    let identity_publisher = identity
        .attribute("Publisher")
        .ok_or_else(|| invalid("Missing VSIX identity publisher"))?;

    if manifest["name"].as_str() != Some(identity_name)
        || manifest["publisher"].as_str() != Some(identity_publisher)
    {
        return Err(invalid("VSIX identity mismatch").into());
    }

    let packaged: Value =
        serde_json::from_slice(&read_entry(&mut archive, "extension/package.json")?)?;

    for field in ["name", "publisher", "version"] {
        if !manifest[field].is_string() || packaged[field] != manifest[field] {
            return Err(invalid(format!("VSIX metadata mismatch: {field}")).into());
        }
    }

    if packaged["version"].as_str() != Some(version) {
        return Err(invalid("VSIX identity version mismatch").into());
    }

    let mut translations = BTreeMap::new();

    for name in REQUIRED {
        let bytes = read_entry(&mut archive, name)?;

        if name.ends_with(".bin") {
            catalog(&bytes)?;
        }

        if name.ends_with(".bin") || name.contains("package.nls") {
            let digest: [u8; 32] = Sha256::digest(&bytes).into();
            translations.insert(name.to_owned(), digest);
        }
    }

    Ok(Package {
        target,
        digest: state::checksum(path)?,
        translations,
    })
}
