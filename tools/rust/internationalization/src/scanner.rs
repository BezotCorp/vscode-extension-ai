// The translation functions to look for.
const TRANSLATION_CALLS: [&str; 3] = ["t", "tr", "ui"];
// A `/` after one of these starts a regular expression, not a division.
const BEFORE_REGEX: &str = "(,=:[!&|?{};+-*%<>~^";

pub fn literals(text: &str) -> Vec<Literal> {
    let mut scanner = Scanner {
        chars: text.chars().collect(),
        position: 0,
        last: None,
        found: Vec::new(),
    };

    scanner.code(false);

    scanner.found
}

struct Scanner {
    chars: Vec<char>,
    position: usize,
    // The last significant character seen, to tell a regex from a division.
    last: Option<char>,
    found: Vec<Literal>,
}

impl Scanner {
    fn peek(&self, offset: usize) -> Option<char> {
        self.chars.get(self.position + offset).copied()
    }

    // Walks code. Inside `${...}` it returns after the matching brace.
    fn code(&mut self, inside_template: bool) {
        let mut depth = 0usize;

        while let Some(c) = self.peek(0) {
            match c {
                '{' => {
                    depth += 1;
                    self.step(c);
                }
                '}' => {
                    if inside_template && depth == 0 {
                        self.position += 1;
                        return;
                    }

                    depth = depth.saturating_sub(1);
                    self.step(c);
                }
                '/' if self.peek(1) == Some('/') => {
                    while self.peek(0).is_some_and(|c| c != '\n') {
                        self.position += 1;
                    }
                }
                '/' if self.peek(1) == Some('*') => {
                    self.position += 2;

                    while self.peek(0).is_some()
                        && !(self.peek(0) == Some('*') && self.peek(1) == Some('/'))
                    {
                        self.position += 1;
                    }

                    self.position += 2;
                }
                '/' if self.last.is_none_or(|last| BEFORE_REGEX.contains(last)) => self.regex(),
                '\'' | '"' => self.quoted(c),
                '`' => self.template(),
                c if c.is_whitespace() => self.position += 1,
                c => self.step(c),
            }
        }
    }

    fn step(&mut self, c: char) {
        self.last = Some(c);
        self.position += 1;
    }

    fn regex(&mut self) {
        let mut in_class = false;

        self.position += 1;

        while let Some(c) = self.peek(0) {
            self.position += 1;

            match c {
                '\\' => self.position += 1,
                '[' => in_class = true,
                ']' => in_class = false,
                '/' if !in_class => break,
                '\n' => break,
                _ => {}
            }
        }

        self.last = Some('/');
    }

    fn quoted(&mut self, quote: char) {
        let (start, line) = (self.position, self.line());
        let mut text = String::new();

        self.position += 1;

        while let Some(c) = self.peek(0) {
            self.position += 1;

            match c {
                '\\' => {
                    if let Some(escaped) = self.peek(0) {
                        text.push(escaped);
                        self.position += 1;
                    }
                }
                c if c == quote || c == '\n' => break,
                c => text.push(c),
            }
        }

        let translated = self.after_translation_call(start);

        self.found.push(Literal {
            line,
            parts: vec![Part::Text(text)],
            translated,
        });
        self.last = Some(quote);
    }

    fn template(&mut self) {
        let (start, line) = (self.position, self.line());
        let mut parts = Vec::new();
        let mut text = String::new();

        self.position += 1;

        while let Some(c) = self.peek(0) {
            match c {
                '\\' => {
                    self.position += 1;

                    if let Some(escaped) = self.peek(0) {
                        text.push(escaped);
                        self.position += 1;
                    }
                }
                '`' => {
                    self.position += 1;
                    break;
                }
                '$' if self.peek(1) == Some('{') => {
                    self.position += 2;
                    parts.push(Part::Text(std::mem::take(&mut text)));
                    parts.push(Part::Any);
                    self.code(true);
                }
                c => {
                    text.push(c);
                    self.position += 1;
                }
            }
        }

        parts.push(Part::Text(text));

        let translated = self.after_translation_call(start);

        // The webview scripts are written inside template literals: their own tr('...') calls are translation calls too.
        for part in &parts {
            if let Part::Text(text) = part {
                self.embedded_calls(text, line);
            }
        }

        self.found.push(Literal {
            line,
            parts,
            translated,
        });
        self.last = Some('`');
    }

    fn embedded_calls(&mut self, text: &str, line: usize) {
        let mut rest = text;

        while let Some(index) = rest.find("tr(") {
            let before = rest[..index].chars().next_back();
            let after = &rest[index + 3..];

            rest = after;

            if before.is_some_and(|c| c.is_alphanumeric() || c == '_' || c == '.' || c == '$') {
                continue;
            }

            let Some(quote) = after.chars().next().filter(|c| *c == '\'' || *c == '"') else {
                continue;
            };

            if let Some(end) = after[1..].find(quote) {
                self.found.push(Literal {
                    line,
                    parts: vec![Part::Text(after[1..1 + end].to_string())],
                    translated: true,
                });
            }
        }
    }

    fn line(&self) -> usize {
        1 + self.chars[..self.position]
            .iter()
            .filter(|c| **c == '\n')
            .count()
    }

    // Is the literal that starts at `start` the argument of t(...), tr(...) or ui(...)?
    fn after_translation_call(&self, start: usize) -> bool {
        let before: String = self.chars[start.saturating_sub(64)..start].iter().collect();
        let before = before.trim_end();

        let Some(before) = before.strip_suffix('(') else {
            return false;
        };
        let before = before.trim_end();
        let name: String = before
            .chars()
            .rev()
            .take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '$')
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        let preceding = before[..before.len() - name.len()].chars().next_back();

        TRANSLATION_CALLS.contains(&name.as_str()) && preceding != Some('.')
    }
}
