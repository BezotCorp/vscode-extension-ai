// Reads data/i18n/<locale>.ron, validates it and the TypeScript code that uses it, and generates:
//   package.nls.json, package.nls.<locale>.json   what package.json shows (common + package)
//   dist/i18n/<locale>.bin                         the runtime catalog (common as "global" + extension)
//
// Nothing is generated for TypeScript: the .bin files carry their own namespaces and keys.
//
// Usage: internationalization [repository-root]   (default: the current directory)
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
        eprintln!("i18n generation failed:\n{error}");
        process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let root = match env::args().nth(1) {
        Some(path) => PathBuf::from(path),
        None => env::current_dir()?,
    };
    let locales = source::load(&root.join("data/i18n"))?;
    let mut problems = validate::validate(&locales);

    // The usage audit compares against the default locale, which the validation above has just vouched for.
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

    for locale in &locales {
        output::write_package_nls(&root, &locales, locale)?;
        output::write_catalog(&root.join("dist/i18n"), locale)?;
    }

    println!("i18n: {} locale(s) generated.", locales.len());

    Ok(())
}
