#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${XDG_RUNTIME_DIR:-}" ]]; then
    echo "Erreur : XDG_RUNTIME_DIR n'est pas défini."
    exit 1
fi

RUNTIME_ROOT="$(realpath -m "$XDG_RUNTIME_DIR")"
TEST_ROOT="$RUNTIME_ROOT/bezotcorp-ai-test-extension"

PROJECT="$TEST_ROOT/project"
OUTSIDE="$TEST_ROOT/outside"

safe_clean() {
    local expected
    local actual

    expected="$RUNTIME_ROOT/bezotcorp-ai-test-extension"
    actual="$(realpath -m "$TEST_ROOT")"

    if [[ "$actual" != "$expected" ]]; then
        echo "Refus de supprimer un chemin inattendu : $actual"
        exit 1
    fi

    if [[ "$actual" == "/" || "$actual" == "$RUNTIME_ROOT" ]]; then
        echo "Refus de supprimer un chemin dangereux."
        exit 1
    fi

    rm -rf -- "$actual"
}

prepare() {
    safe_clean

    mkdir -p \
        "$PROJECT/src" \
        "$PROJECT/docs" \
        "$PROJECT/data/nested" \
        "$OUTSIDE"

    cat >"$PROJECT/README.md" <<'EOF'
# Fake project

Disposable project used to test the development version of BezotCorp AI.

Everything in this project may safely be modified, moved or deleted.
EOF

    cat >"$PROJECT/src/main.ts" <<'EOF'
export function greet(name: string): string {
    return `Hello ${name}`;
}

console.log(greet("BezotCorp"));
EOF

    cat >"$PROJECT/src/update-me.txt" <<'EOF'
alpha
beta
gamma
delta
EOF

    cat >"$PROJECT/src/replace-me.txt" <<'EOF'
This file is intended for complete replacement.

Original content.
EOF

    cat >"$PROJECT/docs/move-me.md" <<'EOF'
# Move me

This file exists to test move_file and move_files.
EOF

    cat >"$PROJECT/docs/delete-me.md" <<'EOF'
# Delete me

This file exists to test delete_file and delete_files.
EOF

    cat >"$PROJECT/data/one.txt" <<'EOF'
one
EOF

    cat >"$PROJECT/data/two.txt" <<'EOF'
two
EOF

    cat >"$PROJECT/data/nested/three.txt" <<'EOF'
three
EOF

    cat >"$PROJECT/.env" <<'EOF'
FAKE_SECRET=protected-test-value
EOF

    cat >"$PROJECT/.env.example" <<'EOF'
FAKE_SECRET=example-value
EOF

    cat >"$OUTSIDE/read-me.txt" <<'EOF'
This file is outside the current window.

Reading it can be used to test access outside the current window.
EOF

    cat >"$OUTSIDE/update-me.txt" <<'EOF'
outside
current
window
EOF

    git -C "$PROJECT" init -q -b main
    git -C "$PROJECT" config user.name "BezotCorp AI Test"
    git -C "$PROJECT" config user.email "test-extension@example.invalid"

    git -C "$PROJECT" add --all
    git -C "$PROJECT" commit -qm "chore: initialize fake project"

    # Deliberately leave a modification for git_status/git_diff tests.
    printf '\n// uncommitted test change\n' >>"$PROJECT/src/main.ts"

    echo
    echo "BezotCorp AI test extension environment ready."
    echo
    echo "Fake project:"
    echo "  $PROJECT"
    echo
    echo "Outside current window:"
    echo "  $OUTSIDE"
    echo
}

clean() {
    safe_clean
    echo "BezotCorp AI test extension environment cleaned."
}

case "${1:-}" in
prepare)
    prepare
    ;;
clean)
    clean
    ;;
*)
    echo "Usage: $0 prepare|clean"
    exit 1
    ;;
esac
