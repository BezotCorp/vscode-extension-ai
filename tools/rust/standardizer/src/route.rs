use crate::tool::Tool;
use serde::Deserialize;

#[derive(Deserialize)]
pub(crate) struct Route {
    pub(crate) extensions: Vec<String>,
    pub(crate) tools: Vec<Tool>,
}
