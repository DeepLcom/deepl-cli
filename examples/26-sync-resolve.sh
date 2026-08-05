#!/bin/bash
# Sync — Resolving lockfile merge conflicts
# Demonstrates `deepl sync resolve` on a .deepl-sync.lock left conflicted by git

set -e  # Exit on error

echo "=== DeepL CLI: Sync — Resolve Lockfile Conflicts ==="
echo

# resolve reads and rewrites .deepl-sync.lock and never calls the API, so this
# example runs without a key or a network.
echo "No API key needed: resolve works on the lockfile alone."
echo

PROJECT_DIR="/tmp/deepl-sync-resolve-demo"
rm -rf "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR/locales"

cleanup() {
  rm -rf "$PROJECT_DIR"
}
trap cleanup EXIT

cd "$PROJECT_DIR"

cat > .deepl-sync.yaml << 'EOF'
version: 1
source_locale: en
target_locales:
  - de
buckets:
  json:
    include:
      - "locales/en.json"
EOF

echo '{ "greeting": "Hello" }' > locales/en.json
echo '{ "greeting": "Hallo" }' > locales/de.json

echo "Created test project: $PROJECT_DIR"
echo

# 1. A lockfile in the state git leaves behind when two branches both
#    re-translated the same key. Both sides are valid JSON; they differ only in
#    the German translation and its timestamp.
echo "1. A .deepl-sync.lock left conflicted by git merge"
cat > .deepl-sync.lock << 'EOF'
{
  "version": 1,
  "generated_at": "2026-01-01T00:00:00.000Z",
  "source_locale": "en",
  "entries": {
    "locales/en.json": {
<<<<<<< HEAD
      "greeting": { "source_hash": "185f8db32271", "source_text": "Hello", "source_locale": "en", "updated_at": "2026-01-01T00:00:00.000Z", "translations": { "de": { "locale": "de", "hash": "185f8db32271", "status": "translated", "translated_at": "2026-02-01T00:00:00.000Z" } } }
=======
      "greeting": { "source_hash": "185f8db32271", "source_text": "Hello", "source_locale": "en", "updated_at": "2026-01-01T00:00:00.000Z", "translations": { "de": { "locale": "de", "hash": "185f8db32271", "status": "translated", "translated_at": "2026-03-01T00:00:00.000Z" } } }
>>>>>>> feature/de-updates
    }
  },
  "stats": { "total_keys": 1, "total_translations": 1, "last_sync": "2026-01-01T00:00:00.000Z" }
}
EOF
grep -c '<<<<<<<\|=======\|>>>>>>>' .deepl-sync.lock | xargs echo "   conflict marker lines:"
echo "   ours was translated 2026-02-01, theirs 2026-03-01"
echo

# 2. --dry-run prints the decision it would make and leaves the file alone.
echo "2. Preview the decisions without writing (--dry-run)"
deepl sync resolve --dry-run
echo
echo "   lockfile still conflicted after the dry run:"
grep -c '<<<<<<<' .deepl-sync.lock | xargs echo "   remaining <<<<<<< markers:"
echo

# 3. Apply. For each conflicting locale the newer translated_at wins, so the
#    branch that translated later is the one kept.
echo "3. Resolve for real"
deepl sync resolve
echo

echo "4. The newer side survived"
node -e '
const fs = require("fs");
const lock = JSON.parse(fs.readFileSync(".deepl-sync.lock", "utf8"));
const de = lock.entries["locales/en.json"].greeting.translations.de;
console.log("   kept translated_at:", de.translated_at);
console.log("   conflict markers remaining:", /<<<<<<</.test(fs.readFileSync(".deepl-sync.lock", "utf8")) ? "yes" : "none");
'
echo

# 4. JSON output, for a merge driver or CI step that needs to inspect decisions.
echo "5. Machine-readable decisions (--format json)"
cat > .deepl-sync.lock << 'EOF'
{
  "version": 1,
  "generated_at": "2026-01-01T00:00:00.000Z",
  "source_locale": "en",
  "entries": {
    "locales/en.json": {
<<<<<<< HEAD
      "greeting": { "source_hash": "185f8db32271", "source_text": "Hello", "source_locale": "en", "updated_at": "2026-01-01T00:00:00.000Z", "translations": { "de": { "locale": "de", "hash": "185f8db32271", "status": "translated", "translated_at": "2026-02-01T00:00:00.000Z" } } }
=======
      "greeting": { "source_hash": "185f8db32271", "source_text": "Hello", "source_locale": "en", "updated_at": "2026-01-01T00:00:00.000Z", "translations": { "de": { "locale": "de", "hash": "185f8db32271", "status": "translated", "translated_at": "2026-03-01T00:00:00.000Z" } } }
>>>>>>> feature/de-updates
    }
  },
  "stats": { "total_keys": 1, "total_translations": 1, "last_sync": "2026-01-01T00:00:00.000Z" }
}
EOF
deepl sync resolve --format json
echo

cat << 'EOF'

Notes:
  - Each conflicting locale is decided on its own translated_at; the later
    translation wins and the decision names the locale it applied to.
  - A conflict region whose sides do not parse as JSON falls back to keeping the
    longer side. That decision is tagged length-heuristic and logged as a WARN;
    review those by hand rather than trusting them.
  - resolve only settles the lockfile. Run `deepl sync` afterwards to fill any
    translation gaps the merge left behind.

EOF

echo "=== Resolve example complete ==="
