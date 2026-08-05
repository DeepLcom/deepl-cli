#!/bin/bash
# Sync — Auditing translation consistency
# Demonstrates `deepl sync audit` finding one source term translated two ways

set -e  # Exit on error

echo "=== DeepL CLI: Sync — Audit Translation Consistency ==="
echo

# audit compares the lockfile against the translations already on disk and never
# calls the API, so this example runs without a key or a network.
echo "No API key needed: audit compares the lockfile against your target files."
echo

PROJECT_DIR="/tmp/deepl-sync-audit-demo"
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

echo "Created test project: $PROJECT_DIR"
echo

# 1. Two keys carrying the same English source text. This is the ordinary
#    shape of a UI string reused in a button and a menu item.
echo "1. Source file with one term used twice"
cat > locales/en.json << 'EOF'
{
  "save_button": "Save",
  "save_menu": "Save",
  "cancel_button": "Cancel"
}
EOF
cat locales/en.json
echo

# 2. German translated the two "Save" keys differently. Both are valid German;
#    the point is that one product should not use both.
echo "2. German where the same term was translated two ways"
cat > locales/de.json << 'EOF'
{
  "save_button": "Speichern",
  "save_menu": "Sichern",
  "cancel_button": "Abbrechen"
}
EOF
cat locales/de.json
echo

# 3. audit reads source_text and the per-locale status from the lockfile, then
#    compares the actual translated strings in the target files.
cat > .deepl-sync.lock << 'EOF'
{
  "version": 1,
  "generated_at": "2026-01-01T00:00:00.000Z",
  "source_locale": "en",
  "entries": {
    "locales/en.json": {
      "save_button": { "source_hash": "s1", "source_text": "Save", "source_locale": "en", "updated_at": "2026-01-01T00:00:00.000Z", "translations": { "de": { "locale": "de", "hash": "s1", "status": "translated", "translated_at": "2026-01-01T00:00:00.000Z" } } },
      "save_menu": { "source_hash": "s1", "source_text": "Save", "source_locale": "en", "updated_at": "2026-01-01T00:00:00.000Z", "translations": { "de": { "locale": "de", "hash": "s1", "status": "translated", "translated_at": "2026-01-01T00:00:00.000Z" } } },
      "cancel_button": { "source_hash": "c1", "source_text": "Cancel", "source_locale": "en", "updated_at": "2026-01-01T00:00:00.000Z", "translations": { "de": { "locale": "de", "hash": "c1", "status": "translated", "translated_at": "2026-01-01T00:00:00.000Z" } } }
    }
  },
  "stats": { "total_keys": 3, "total_translations": 3, "last_sync": "2026-01-01T00:00:00.000Z" }
}
EOF

echo "3. Audit the project"
deepl sync audit
echo

# 4. JSON for a CI step. inconsistencies[] is empty on a consistent project, so
#    a pipeline can gate on its length.
echo "4. Machine-readable report (--format json)"
deepl sync audit --format json
echo

# 5. Align the two translations and the inconsistency goes away. "Cancel" was
#    never flagged: one source term with one translation is consistent.
echo "5. Align the two translations, then audit again"
cat > locales/de.json << 'EOF'
{
  "save_button": "Speichern",
  "save_menu": "Speichern",
  "cancel_button": "Abbrechen"
}
EOF
deepl sync audit
echo

cat << 'EOF'

Notes:
  - "Audit" here means translation consistency — one source term rendered
    differently across a project — not security auditing in the npm audit sense.
  - Comparison uses the text in your target files, not the lockfile hashes: the
    per-locale hash is a hash of the SOURCE text, so it is identical across a
    term group by construction and cannot identify a translation.
  - A target file that cannot be read or parsed is left out of the comparison
    and listed under missingTargets rather than silently counted as consistent.
  - Inconsistencies are reported, not corrected. Fix them by editing the target
    file, or keep terminology aligned up front with a glossary
    (see 17-glossaries.sh).

EOF

echo "=== Audit example complete ==="
