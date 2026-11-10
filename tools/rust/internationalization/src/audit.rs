// Checks the usage of the messages in the TypeScript code against the default locale.
//
//   - a literal key passed to t(...), tr(...) or ui(...) must exist;
//   - a message nobody uses is reported;
//   - package.json can only reference messages that exist in common or package.
//
// Optional data/i18n/namespaces.ron maps a source path prefix to the namespaces it may use, for example
//   { "src/chat/": ["chat", "global"], "src/permissions/": ["permissions", "global"] }

use crate::scanner::{Part, literals};
use crate::source::{GLOBAL_NAMESPACE, Id, Locale};
use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};

pub fn audit(root: &Path, reference: &Locale) -> Result<Vec<String>, Box<dyn Error>> {
    let runtime: BTreeSet<(String, String)> = reference.source.runtime().into_keys().collect();
    let namespaces: BTreeSet<&str> = runtime
        .iter()
        .map(|(namespace, _)| namespace.as_str())
        .collect();
    let rules = load_rules(&root.join("data/i18n/namespaces.ron"))?;
    let mut used: BTreeSet<(String, String)> = BTreeSet::new();
    let mut problems = Vec::new();

    for file in typescript_files(&root.join("src"))? {
        let name = file
            .strip_prefix(root)?
            .to_string_lossy()
            .replace('\\', "/");
        let allowed = rules
            .iter()
            .filter(|(prefix, _)| name.starts_with(prefix.as_str()))
            .max_by_key(|(prefix, _)| prefix.len())
            .map(|(_, allowed)| allowed);

        for literal in literals(&fs::read_to_string(&file)?) {
            let place = format!("{name}:{}", literal.line);
            let Some(Part::Text(head)) = literal.parts.first() else {
                continue;
            };
            let Some((namespace, _)) = head.split_once('.') else {
                if literal.translated && literal.parts.len() == 1 {
                    problems.push(format!(
                        "{place}: \"{head}\" has no namespace (expected \"namespace.key\")"
                    ));
                }

                continue;
            };
            let known = namespaces.contains(namespace);

            if literal.translated {
                if !known {
                    problems.push(format!(
                        "{place}: unknown namespace \"{namespace}\" in \"{head}\""
                    ));
                    continue;
                }

                if let Some(allowed) = allowed
                    && !allowed.iter().any(|candidate| candidate == namespace)
                {
                    problems.push(format!(
                        "{place}: namespace \"{namespace}\" is not allowed in this part of the code"
                    ));
                }
            }

            if !known {
                continue;
            }

            let matching: Vec<&(String, String)> = runtime
                .iter()
                .filter(|(candidate, key)| matches(&literal.parts, &format!("{candidate}.{key}")))
                .collect();

            if literal.translated && matching.is_empty() {
                problems.push(format!(
                    "{place}: no message matches \"{}\"",
                    describe(&literal.parts)
                ));
            }

            used.extend(matching.into_iter().cloned());
        }
    }

    let manifest = referenced_in_manifest(&root.join("package.json"))?;
    let package: BTreeSet<&String> = reference
        .source
        .common
        .keys()
        .chain(reference.source.package.keys())
        .collect();

    for key in manifest.iter().filter(|key| !package.contains(key)) {
        problems.push(format!("package.json: %{key}% is not in common or package"));
    }

    for (id, _) in reference.source.entries() {
        let unused = match &id {
            Id::Common(key) => {
                !manifest.contains(key)
                    && !used.contains(&(GLOBAL_NAMESPACE.to_string(), key.clone()))
            }
            Id::Package(key) => !manifest.contains(key),
            Id::Runtime { namespace, key } => !used.contains(&(namespace.clone(), key.clone())),
        };

        if unused {
            problems.push(format!("{} is never used", id.describe()));
        }
    }

    Ok(problems)
}

fn describe(parts: &[Part]) -> String {
    parts
        .iter()
        .map(|part| match part {
            Part::Text(text) => text.as_str(),
            Part::Any => "${...}",
        })
        .collect()
}

// Does a literal (with `${...}` holes) describe this "namespace.key"?
fn matches(parts: &[Part], text: &str) -> bool {
    match parts.split_first() {
        None => text.is_empty(),
        Some((Part::Text(prefix), rest)) => text
            .strip_prefix(prefix.as_str())
            .is_some_and(|tail| matches(rest, tail)),
        Some((Part::Any, rest)) => (0..=text.len())
            .filter(|index| text.is_char_boundary(*index))
            .any(|index| matches(rest, &text[index..])),
    }
}

fn typescript_files(directory: &Path) -> Result<Vec<PathBuf>, Box<dyn Error>> {
    let mut files = Vec::new();

    for entry in fs::read_dir(directory)? {
        let path = entry?.path();

        if path.is_dir() {
            files.extend(typescript_files(&path)?);
        } else if path.extension().is_some_and(|extension| extension == "ts") {
            files.push(path);
        }
    }

    files.sort();

    Ok(files)
}

// The %key% references of package.json.
fn referenced_in_manifest(file: &Path) -> Result<BTreeSet<String>, Box<dyn Error>> {
    let text = fs::read_to_string(file)?;
    let mut keys = BTreeSet::new();
    let mut rest = text.as_str();

    while let Some(start) = rest.find('%') {
        let after = &rest[start + 1..];

        match after.find('%') {
            Some(end)
                if !after[..end].is_empty()
                    && after[..end]
                        .chars()
                        .all(|c| c.is_alphanumeric() || ".-_".contains(c)) =>
            {
                keys.insert(after[..end].to_string());
                rest = &after[end + 1..];
            }
            _ => rest = after,
        }
    }

    Ok(keys)
}

fn load_rules(file: &Path) -> Result<BTreeMap<String, Vec<String>>, Box<dyn Error>> {
    if !file.exists() {
        return Ok(BTreeMap::new());
    }

    ron::de::from_str(&fs::read_to_string(file)?)
        .map_err(|error| format!("{}: {error}", file.display()).into())
}
