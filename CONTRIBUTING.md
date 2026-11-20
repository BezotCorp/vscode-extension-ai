# Contributing to BezotCorp AI

Contributions to BezotCorp AI are welcome.

## Contributions

Keep each contribution focused on a clear change.

Avoid unrelated modifications in the same contribution.

## Conformity

The pre-commit hook runs `cargo run --release --quiet --locked --package standardizer -- fix`.
The standardizer selects all tracked regular files whose working copy matches the index
at startup. Files with unstaged changes are excluded entirely, including partially staged
files. Untracked files, symlinks, submodules and deleted working copies are excluded.
Unresolved conflicts stop the run.

`fix` applies available corrections to the real files and stages changed candidates only
when all tools succeed. If a tool fails, corrections remain in the working tree without
being staged. `check` verifies the same candidates without changing files or the index;
CI uses this mode. Run it with `cargo run --locked --package standardizer -- check`.

Rust files use rustfmt directly, with the package edition from Cargo metadata and module
traversal disabled to preserve the selection. Biome receives candidate paths directly;
each tool retains its native configuration and exclusions. Conformity currently covers
formatting and linting where supported; Rust linting is not run through Cargo because
it cannot be restricted to the selected files.

## Commit Messages

Only these commit prefixes are accepted:

- `feat:` for new functionality
- `fix:` for bug fixes
- `chore:` for maintenance, cleanup and refactoring

No other commit prefix is used.

## Tests

### Unit Tests

Unit tests are kept close to the code they cover, inside a `tests/` subdirectory of the corresponding module.

Example:

```text
src/
  permissions/
    protected_resources.ts
    tests/
      protected_resources.test.ts
```

Use `*.test.ts` for unit test files.

### Integration Tests

Integration tests that exercise interactions between multiple modules are stored under the repository-level `tests/integration/` directory.

Example:

```text
tests/
  integration/
    permissions_and_tools.test.ts
```

### End-to-End Tests

End-to-end tests that exercise complete application workflows are stored under `tests/e2e/`.

Example:

```text
tests/
  e2e/
    conversation_tool_flow.test.ts
```

### Performance Tests

Performance tests are stored under `tests/performance/`.

Example:

```text
tests/
  performance/
    search_text.performance.test.ts
```

Performance tests are kept separate from normal unit and integration test runs unless explicitly included.

## Pull Requests

Describe clearly what the change does and why it is needed.

Keep the pull request limited to the change being proposed.

---

[← Back to the developer guide](FOR_DEVELOPERS.md)
