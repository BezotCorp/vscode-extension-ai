// Checks the relations between the locale files. Nothing is generated from sources that fail here.
use crate::source::{DEFAULT_LOCALE, GLOBAL_NAMESPACE, Locale};
use std::collections::BTreeSet;

pub fn validate(locales: &[Locale]) -> Vec<String> {
    let mut problems = Vec::new();

    let Some(reference) = locales.iter().find(|locale| locale.name == DEFAULT_LOCALE) else {
        return vec![format!(
            "the default locale \"{DEFAULT_LOCALE}\" has no data/i18n/{DEFAULT_LOCALE}.ron"
        )];
    };

    for locale in locales {
        check_name(locale, &mut problems);
        check_scopes(locale, &mut problems);
    }

    for locale in locales
        .iter()
        .filter(|locale| locale.name != reference.name)
    {
        match locale.base() {
            None => check_complete(locale, reference, &mut problems),
            Some(base) => match locales.iter().find(|candidate| candidate.name == base) {
                Some(base) => check_regional(locale, base, &mut problems),
                None => problems.push(format!(
                    "{}: its base language \"{base}\" has no data/i18n/{base}.ron",
                    locale.name
                )),
            },
        }
    }

    problems
}

fn check_name(locale: &Locale, problems: &mut Vec<String>) {
    let mut parts = locale.name.split('-');
    let language = parts.next().unwrap_or_default();
    let region = parts.next();
    let valid = (2..=3).contains(&language.len())
        && language.chars().all(|c| c.is_ascii_lowercase())
        && region.is_none_or(|region| {
            (2..=8).contains(&region.len()) && region.chars().all(|c| c.is_ascii_alphanumeric())
        })
        && parts.next().is_none();

    if !valid {
        problems.push(format!(
            "{}: not a locale name (expected \"fr\" or \"fr-CA\")",
            locale.name
        ));
    }
}

// A message has one place: common, package or one namespace of extension.
fn check_scopes(locale: &Locale, problems: &mut Vec<String>) {
    let name = &locale.name;
    let identifier = |text: &str| {
        text.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
            && text.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
    };

    for namespace in locale.source.extension.keys() {
        if !identifier(namespace) {
            problems.push(format!(
                "{name}: \"{namespace}\" is not a valid namespace name"
            ));
        }
    }

    for key in locale
        .source
        .common
        .keys()
        .chain(locale.source.package.keys())
    {
        if key.is_empty() {
            problems.push(format!("{name}: empty key"));
        }
    }

    for key in locale
        .source
        .package
        .keys()
        .filter(|key| locale.source.common.contains_key(*key))
    {
        problems.push(format!("{name}: \"{key}\" is in both common and package"));
    }

    if let Some(global) = locale.source.extension.get(GLOBAL_NAMESPACE) {
        for key in global
            .keys()
            .filter(|key| locale.source.common.contains_key(*key))
        {
            problems.push(format!(
                "{name}: \"{key}\" is in both common (which is the runtime namespace \"global\") and extension.global"
            ));
        }
    }
}

// A base language holds the whole expected catalog: same messages as the default locale, same placeholders.
fn check_complete(locale: &Locale, reference: &Locale, problems: &mut Vec<String>) {
    let expected = reference.source.entries();
    let actual = locale.source.entries();

    for id in expected.keys().filter(|id| !actual.contains_key(*id)) {
        problems.push(format!("{}: missing {}", locale.name, id.describe()));
    }

    for id in actual.keys().filter(|id| !expected.contains_key(*id)) {
        problems.push(format!(
            "{}: {} does not exist in {}",
            locale.name,
            id.describe(),
            reference.name
        ));
    }

    compare_placeholders(locale, reference, problems);
}

// A regional locale only holds differences: nothing may exist that its base language does not have.
fn check_regional(locale: &Locale, base: &Locale, problems: &mut Vec<String>) {
    let expected = base.source.entries();

    for id in locale
        .source
        .entries()
        .keys()
        .filter(|id| !expected.contains_key(*id))
    {
        problems.push(format!(
            "{}: {} does not exist in its base language {}",
            locale.name,
            id.describe(),
            base.name
        ));
    }

    compare_placeholders(locale, base, problems);
}

fn compare_placeholders(locale: &Locale, against: &Locale, problems: &mut Vec<String>) {
    let expected = against.source.entries();

    for (id, value) in locale.source.entries() {
        if let Some(expected_value) = expected.get(&id)
            && placeholders(value) != placeholders(expected_value)
        {
            problems.push(format!(
                "{}: {} has different placeholders than {}",
                locale.name,
                id.describe(),
                against.name
            ));
        }
    }
}

// The {name} placeholders of a message.
fn placeholders(text: &str) -> BTreeSet<String> {
    let mut found = BTreeSet::new();
    let mut rest = text;

    while let Some(start) = rest.find('{') {
        let after = &rest[start + 1..];

        match after.find('}') {
            Some(end)
                if !after[..end].is_empty()
                    && after[..end]
                        .chars()
                        .all(|c| c.is_alphanumeric() || c == '_') =>
            {
                found.insert(after[..end].to_string());
                rest = &after[end + 1..];
            }
            _ => rest = after,
        }
    }

    found
}
