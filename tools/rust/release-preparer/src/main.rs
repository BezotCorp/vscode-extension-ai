mod flow;
mod package;
mod state;

use std::env;
use std::error::Error;
use std::path::Path;

type Result<T> = std::result::Result<T, Box<dyn Error>>;

fn invalid(message: impl Into<String>) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidData, message.into())
}

fn run() -> Result<()> {
    let args: Vec<String> = env::args().skip(1).collect();

    match args.as_slice() {
        [command, directory, target, commit, manifest, packages] if command == "record" => {
            flow::record(
                Path::new(directory),
                target,
                commit,
                Path::new(manifest),
                Path::new(packages),
            )
        }
        [command, directory, expected, commit] if command == "decision" => {
            flow::decision(Path::new(directory), &state::targets(expected)?, commit)
        }
        [command, directory, expected, commit, manifest, packages] if command == "verify" => {
            flow::verify(
                Path::new(directory),
                &state::targets(expected)?,
                commit,
                Path::new(manifest),
                Path::new(packages),
            )
        }
        _ => Err(invalid(
            "Usage:
  release-preparer record <state-dir> <target> <commit> <manifest-dir> <vsix-dir>
  release-preparer decision <state-dir> <targets-json> <commit>
  release-preparer verify <state-dir> <targets-json> <commit> <manifest-dir> <vsix-dir>",
        )
        .into()),
    }
}

fn main() {
    if let Err(error) = run() {
        eprintln!("release-preparer: {error}");
        std::process::exit(1);
    }
}
