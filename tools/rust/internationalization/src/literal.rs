use crate::part::Part;

pub struct Literal {
    pub line: usize,
    pub parts: Vec<Part>,
    // The argument of t(...), tr(...) or ui(...).
    pub translated: bool,
}
