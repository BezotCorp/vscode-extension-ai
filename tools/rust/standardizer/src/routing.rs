use crate::{route::Route, tool::Tool};
use serde::Deserialize;
use std::{collections::BTreeSet, error::Error, fs, path::Path};

#[derive(Deserialize)]
pub(crate) struct Routing {
    routes: Vec<Route>,
}

impl Routing {
    pub(crate) fn load(root: &Path) -> Result<Self, Box<dyn Error>> {
        let path = root.join("data/standardizer/routing.ron");
        let source = fs::read_to_string(&path)?;
        let routing: Self = ron::from_str(&source)?;

        for route in &routing.routes {
            if route.extensions.is_empty() || route.tools.is_empty() {
                return Err("routing rules require extensions and tools".into());
            }
        }

        Ok(routing)
    }

    pub(crate) fn tools(&self, path: &Path) -> BTreeSet<Tool> {
        let mut selected = BTreeSet::new();

        let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
            return selected;
        };

        for route in &self.routes {
            if route
                .extensions
                .iter()
                .any(|candidate| candidate.eq_ignore_ascii_case(extension))
            {
                selected.extend(route.tools.iter().copied());
            }
        }

        selected
    }
}
