#[derive(Clone, Debug)]
pub enum Part {
    Text(String),
    // A `${...}` of a template literal: any text.
    Any,
}
