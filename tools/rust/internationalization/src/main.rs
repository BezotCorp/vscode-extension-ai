// Reads data/i18n/sources/<locale>.ron, validates it and the TypeScript code that uses it, and generates:
//   package.nls.json, package.nls.<locale>.json   what package.json shows (common + package)
//   data/i18n/output/<locale>.bin                  the runtime catalog (common as "global" + extension)
//
// Nothing is generated for TypeScript: the .bin files carry their own namespaces and keys.
//
// Usage: internationalization [repository-root]
// Default root: current directory.
mod audit;
mod id;
mod literal;
mod locale;
mod messages;
mod output;
mod part;
mod scanner;
mod source;
mod validate;

use source::DEFAULT_LOCALE;
use std::{env, error::Error, path::PathBuf, process};

fn main() {
    if let Err(error) = run() {
        eprintln!("i18n failed:\n{error}");
        process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let mut root = None;

    for argument in env::args().skip(1) {
        if argument.starts_with('-') {
            return Err(format!("unknown argument: {argument}").into());
        }

        if root.is_some() {
            return Err("repository root specified more than once".into());
        }

        root = Some(PathBuf::from(argument));
    }

    let root = match root {
        Some(path) => path,
        None => env::current_dir()?,
    };

    let locales = source::load(&root.join("data/i18n/sources"))?;
    let mut problems = validate::validate(&locales);

    // Keep validation and TypeScript usage audit unchanged.
    if problems.is_empty() {
        let reference = locales
            .iter()
            .find(|locale| locale.name == DEFAULT_LOCALE)
            .ok_or("missing default locale")?;

        problems = audit::audit(&root, reference)?;
    }

    if !problems.is_empty() {
        return Err(format!("{}\n\n{} problem(s).", problems.join("\n"), problems.len()).into());
    }

    // Produce every final output in RAM before touching the filesystem.
    let mut projections = Vec::with_capacity(locales.len() * 2);

    for locale in &locales {
        projections.push(output::package_nls(&root, &locales, locale)?);
        projections.push(output::catalog(&root.join("data/i18n/output"), locale)?);
    }

    let summary = output::synchronize(&projections)?;

    println!(
        "i18n: {} locale(s), {} written, {} unchanged.",
        locales.len(),
        summary.changed,
        summary.unchanged
    );

    Ok(())
}
