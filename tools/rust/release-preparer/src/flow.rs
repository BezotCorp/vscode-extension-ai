use crate::state::State;
use crate::{Result, invalid, package, state};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

pub(crate) fn record(
    directory: &Path,
    target: &str,
    commit: &str,
    manifest_directory: &Path,
    package_directory: &Path,
) -> Result<()> {
    let files = package::packages(package_directory)?;

    if files.len() > 1 {
        return Err(invalid("Multiple VSIX files for one platform").into());
    }

    let digest = if let Some(file) = files.first() {
        let manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(manifest_directory.join("package.json"))?)?;

        let inspected = package::verify(file, &manifest)?;

        if inspected.target != target {
            return Err(invalid("Prepared VSIX target mismatch").into());
        }

        Some(inspected.digest)
    } else {
        None
    };

    let state = State::new(target, commit, digest)?;
    state::write_state(directory, &state)?;

    println!(
        "{}: {}",
        target,
        if digest.is_some() {
            "prepared"
        } else {
            "no release"
        },
    );

    Ok(())
}

fn states(directory: &Path, expected: &[String], commit: &str) -> Result<Vec<State>> {
    let actual: BTreeSet<String> = fs::read_dir(directory)?
        .map(|entry| {
            let path = entry?.path();

            if path.extension().is_some_and(|ext| ext == "bin") {
                Ok(path
                    .file_stem()
                    .ok_or_else(|| invalid("Invalid state filename"))?
                    .to_string_lossy()
                    .into_owned())
            } else {
                Ok(String::new())
            }
        })
        .collect::<std::io::Result<BTreeSet<_>>>()?
        .into_iter()
        .filter(|name| !name.is_empty())
        .collect();

    let wanted: BTreeSet<String> = expected.iter().cloned().collect();

    if actual != wanted {
        return Err(invalid(format!(
            "Platform states mismatch: {actual:?} != {wanted:?}"
        ))
        .into());
    }

    let mut result = Vec::new();

    for target in expected {
        let state = state::read_state(directory, target)?;

        if state.commit != commit {
            return Err(invalid("Commit mismatch").into());
        }

        result.push(state);
    }

    Ok(result)
}

pub(crate) fn decision(directory: &Path, expected: &[String], commit: &str) -> Result<()> {
    let states = states(directory, expected, commit)?;

    let present = states.iter().filter(|state| state.digest.is_some()).count();

    if present != 0 && present != states.len() {
        return Err(invalid("Platforms disagree on release availability").into());
    }

    let publish = present == states.len();

    println!("publish={publish}");

    Ok(())
}

pub(crate) fn verify(
    directory: &Path,
    expected: &[String],
    commit: &str,
    manifest_directory: &Path,
    package_directory: &Path,
) -> Result<()> {
    let states = states(directory, expected, commit)?;

    if states.iter().any(|state| state.digest.is_none()) {
        return Err(invalid("Missing release package").into());
    }

    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(manifest_directory.join("package.json"))?)?;

    if !manifest_directory.join("CHANGELOG.md").is_file() {
        return Err(invalid("Missing prepared changelog").into());
    }

    let files = package::packages(package_directory)?;

    if files.len() != expected.len() {
        return Err(invalid("Unexpected number of VSIX packages").into());
    }

    let state_map: BTreeMap<_, _> = states
        .iter()
        .map(|state| (state.target.as_str(), state))
        .collect();

    let mut found = BTreeSet::new();
    let mut reference = None;

    for file in files {
        let inspected = package::verify(&file, &manifest)?;

        let recorded = state_map
            .get(inspected.target.as_str())
            .ok_or_else(|| invalid("Unexpected VSIX target"))?;

        if !found.insert(inspected.target.clone()) {
            return Err(invalid("Duplicate VSIX target").into());
        }

        if recorded.digest != Some(inspected.digest) {
            return Err(invalid(format!("VSIX checksum mismatch: {}", file.display())).into());
        }

        match &reference {
            None => reference = Some(inspected.translations),
            Some(previous) if previous != &inspected.translations => {
                return Err(invalid("Translation contents differ between platforms").into());
            }
            Some(_) => {}
        }
    }

    let wanted: BTreeSet<_> = expected.iter().cloned().collect();

    if found != wanted {
        return Err(invalid("Missing release target").into());
    }

    println!("Validated {} VSIX packages", found.len());
    Ok(())
}
