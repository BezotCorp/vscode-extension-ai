use crate::{Result, invalid};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const MAGIC: &[u8] = b"BZREL\x01";
const MAX_LENGTH: usize = 128;

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct State {
    pub(crate) target: String,
    pub(crate) commit: String,
    pub(crate) digest: Option<[u8; 32]>,
}

fn valid_target(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn valid_commit(value: &str) -> bool {
    (value.len() == 40 || value.len() == 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub(crate) fn targets(path: &str) -> Result<Vec<String>> {
    let config: serde_json::Value = serde_json::from_slice(&fs::read(path)?)?;

    let platforms = config["include"]
        .as_array()
        .ok_or_else(|| invalid("Missing release target matrix"))?;

    let mut items = Vec::new();
    let mut unique = BTreeSet::new();

    for platform in platforms {
        let target = platform["target"]
            .as_str()
            .ok_or_else(|| invalid("Missing release target"))?;

        let os = platform["os"]
            .as_str()
            .ok_or_else(|| invalid("Missing release runner"))?;

        if !valid_target(target) || os.is_empty() || !unique.insert(target.to_owned()) {
            return Err(invalid("Invalid or duplicate release target").into());
        }

        items.push(target.to_owned());
    }

    if items.is_empty() {
        return Err(invalid("Empty release target matrix").into());
    }

    Ok(items)
}

impl State {
    pub(crate) fn new(target: &str, commit: &str, digest: Option<[u8; 32]>) -> Result<Self> {
        if !valid_target(target) || !valid_commit(commit) {
            return Err(invalid("Invalid target or commit").into());
        }

        Ok(Self {
            target: target.to_owned(),
            commit: commit.to_owned(),
            digest,
        })
    }

    fn encode(&self) -> Result<Vec<u8>> {
        let mut bytes = MAGIC.to_vec();

        for value in [&self.target, &self.commit] {
            if value.len() > MAX_LENGTH {
                return Err(invalid("State field too long").into());
            }

            bytes.extend_from_slice(&u16::try_from(value.len())?.to_le_bytes());
            bytes.extend_from_slice(value.as_bytes());
        }

        match self.digest {
            Some(digest) => {
                bytes.push(1);
                bytes.extend_from_slice(&digest);
            }
            None => bytes.push(0),
        }

        Ok(bytes)
    }

    fn decode(bytes: &[u8]) -> Result<Self> {
        if !bytes.starts_with(MAGIC) {
            return Err(invalid("Invalid state header").into());
        }

        let mut cursor = MAGIC.len();

        fn read_string(bytes: &[u8], cursor: &mut usize) -> Result<String> {
            let length = bytes
                .get(*cursor..*cursor + 2)
                .ok_or_else(|| invalid("Truncated state length"))?;

            let length = u16::from_le_bytes(length.try_into()?) as usize;
            *cursor += 2;

            if length > MAX_LENGTH {
                return Err(invalid("State field too long").into());
            }

            let value = bytes
                .get(*cursor..*cursor + length)
                .ok_or_else(|| invalid("Truncated state value"))?;

            *cursor += length;
            Ok(std::str::from_utf8(value)?.to_owned())
        }

        let target = read_string(bytes, &mut cursor)?;
        let commit = read_string(bytes, &mut cursor)?;

        let marker = *bytes
            .get(cursor)
            .ok_or_else(|| invalid("Missing digest marker"))?;
        cursor += 1;

        let digest = match marker {
            0 => None,
            1 => {
                let bytes = bytes
                    .get(cursor..cursor + 32)
                    .ok_or_else(|| invalid("Truncated digest"))?;
                cursor += 32;
                Some(bytes.try_into()?)
            }
            _ => return Err(invalid("Invalid digest marker").into()),
        };

        if cursor != bytes.len() {
            return Err(invalid("Trailing state bytes").into());
        }

        Self::new(&target, &commit, digest)
    }
}

pub(crate) fn checksum(path: &Path) -> Result<[u8; 32]> {
    let mut file = fs::File::open(path)?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];

    loop {
        let length = file.read(&mut buffer)?;
        if length == 0 {
            break;
        }
        hash.update(&buffer[..length]);
    }

    Ok(hash.finalize().into())
}

fn state_path(directory: &Path, target: &str) -> Result<PathBuf> {
    if !valid_target(target) {
        return Err(invalid("Invalid state target").into());
    }

    Ok(directory.join(format!("{target}.bin")))
}

pub(crate) fn write_state(directory: &Path, state: &State) -> Result<()> {
    let destination = state_path(directory, &state.target)?;
    let bytes = state.encode()?;

    if destination.exists() {
        if fs::read(&destination)? == bytes {
            return Ok(());
        }
        return Err(invalid("Conflicting release state").into());
    }

    fs::create_dir_all(directory)?;

    for attempt in 0..32 {
        let temporary = directory.join(format!(
            ".{}.{}.{}.tmp",
            state.target,
            std::process::id(),
            attempt,
        ));

        let mut file = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                continue;
            }
            Err(error) => return Err(error.into()),
        };

        let written = file.write_all(&bytes).and_then(|_| file.sync_all());
        drop(file);

        if let Err(error) = written {
            let _ = fs::remove_file(&temporary);
            return Err(error.into());
        }

        // Install only if the destination does not already exist.
        let linked = fs::hard_link(&temporary, &destination);
        let cleanup = fs::remove_file(&temporary);

        if let Err(error) = cleanup {
            return Err(error.into());
        }

        match linked {
            Ok(()) => return Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                if fs::read(&destination)? == bytes {
                    return Ok(());
                }
                return Err(invalid("Conflicting release state").into());
            }
            Err(error) => return Err(error.into()),
        }
    }

    Err(invalid("Cannot allocate temporary state file").into())
}

pub(crate) fn read_state(directory: &Path, target: &str) -> Result<State> {
    let state = State::decode(&fs::read(state_path(directory, target)?)?)?;

    if state.target != target {
        return Err(invalid("State target mismatch").into());
    }

    Ok(state)
}
