#!/bin/bash
# Example 34: Sync — Laravel PHP arrays
# Demonstrates the laravel_php format parser: AST allowlist, span-surgical
# reconstruct, pipe-pluralization warning gate, and sync.limits caps.

set -e

echo "=== DeepL CLI Example 34: Sync — Laravel PHP arrays ==="
echo

if ! deepl auth show &>/dev/null; then
  echo "Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "API key configured"
echo

PROJECT_DIR="/tmp/deepl-sync-laravel-demo"
rm -rf "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR/lang/en"
trap 'rm -rf "$PROJECT_DIR"' EXIT

echo "Created test project: $PROJECT_DIR"
echo

# Example 1: Create a Laravel-style lang file
echo "1. Create lang/en/messages.php"
cat > "$PROJECT_DIR/lang/en/messages.php" << 'EOF'
<?php
/**
 * Example Laravel language lines.
 */

return [
    'greeting' => 'Welcome, :name!',
    'farewell' => 'Goodbye',

    'auth' => [
        'failed'   => 'These credentials do not match our records.',
        'throttle' => 'Too many login attempts. Please try again later.',
    ],

    // Pipe-pluralization is NOT translated by DeepL — preserved verbatim.
    // `deepl sync status` will surface it as a skippedKeys count.
    'apples' => '{0} No apples|{1} One apple|[2,*] :count apples',

    // Plain prose with literal pipes (e.g., keyboard shortcuts) is untouched
    // by the pluralization gate and flows through translation normally.
    'keyboard' => 'Press Ctrl | Cmd to continue',
];
EOF
echo "   Created lang/en/messages.php"
echo

# Example 2: Configure sync for the laravel_php bucket
echo "2. Initialize sync config for laravel_php"
cd "$PROJECT_DIR"

deepl sync init \
  --source-locale en \
  --target-locales de,fr \
  --file-format laravel_php \
  --path "lang/en/*.php"

echo
echo "   Generated .deepl-sync.yaml:"
cat "$PROJECT_DIR/.deepl-sync.yaml"
echo

# Example 3: Dry-run to preview
echo "3. Preview changes (--dry-run)"
deepl sync --dry-run
echo

# Example 4: Status BEFORE sync — shows skippedKeys > 0 for the |-pluralization value
echo "4. Status before sync (observe skippedKeys for the pipe-pluralization value)"
deepl sync status --format json | grep -E '"(totalKeys|skippedKeys|sourceLocale)"'
echo

# Example 5: Run the sync
echo "5. Sync translations (pipe-pluralization value is skipped by the gate)"
deepl sync
echo

# Example 6: Show the generated de file — demonstrate span-surgical preservation
echo "6. Generated lang/de/messages.php (span-surgical: comments, PHPDoc, and"
echo "   the |-pluralization line round-trip byte-verbatim; only translatable"
echo "   string values are rewritten):"
cat "$PROJECT_DIR/lang/de/messages.php" 2>/dev/null || echo "   (target path pattern may differ; check .deepl-sync.yaml)"
echo

# Example 7: Status AFTER sync
echo "7. Status after sync"
deepl sync status
echo

# Example 8: sync.limits — skip a file that exceeds max_file_bytes
echo "8. Optional hardening: per-file caps via sync.limits"
cat <<'EOF'
Add a `limits` block under `sync:` in .deepl-sync.yaml:

    sync:
      concurrency: 5
      batch_size: 50
      limits:
        max_entries_per_file: 25000   # default; hard ceiling 100000
        max_file_bytes: 4194304       # default 4 MiB; hard ceiling 10 MiB
        max_depth: 32                 # default; hard ceiling 64

Files that breach any effective cap are skipped with a warning on stderr.
Values above the hard ceiling fail at load with ConfigError (exit 7).
EOF
echo

echo "=== Laravel PHP sync features exercised ==="
echo
echo "Allowlist at extract:"
echo "  ACCEPT: single-quoted 'x', double-quoted \"x\" (no interpolation),"
echo "          nested [...] or array(...), :placeholder values, scalars."
echo "  REJECT: \"Hello \$name\" (encapsed), heredoc, nowdoc, 'a' . 'b' (concat)."
echo
echo "Span-surgical reconstruct:"
echo "  Every byte outside a replaced string literal round-trips verbatim —"
echo "  comments, PHPDoc, trailing commas, irregular whitespace, quote style."
echo
echo "Pipe-pluralization gate:"
echo "  Values matching /\\|\\s*(\\{\\d+\\}|\\[\\d+,(\\d+|\\*)\\])/ are excluded"
echo "  from the translation batch, round-trip byte-unchanged, and are surfaced"
echo "  as skippedKeys in 'deepl sync status'."
echo
echo "Supply chain:"
echo "  php-parser is lazy-loaded only when a laravel_php bucket is configured,"
echo "  has zero runtime dependencies, no install hooks, and no dangerous"
echo "  imports (audited and gated in CI)."
echo

echo "=== Example 34 completed successfully ==="
