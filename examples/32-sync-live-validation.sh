#!/bin/bash
# Example 32: Sync — Live API Validation
# Comprehensive end-to-end validation of all sync features against the real DeepL API.
# Exercises: multi-format, placeholders, plurals, incremental sync, new locales,
# frozen mode, status, validate, force, and context extraction.

set -euo pipefail

echo "=== DeepL CLI Example 32: Sync — Live API Validation ==="
echo

# Check API key
if ! deepl auth show &>/dev/null; then
  echo "Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

# Setup
PROJECT_DIR="/tmp/deepl-sync-validation-$$"
PASS=0
FAIL=0

cleanup() {
  rm -rf "$PROJECT_DIR"
}
trap cleanup EXIT

# NOTE: under `set -e`, `((PASS++))` exits with status 1 when PASS is 0
# (post-increment evaluates to the OLD value, which arithmetic context
# treats as failure). Use plain assignment to always return 0.
assert() {
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_exists() { assert "$1" test -f "$2"; }
assert_file_contains() { assert "$1: contains '$3'" grep -q "$3" "$2"; }
assert_file_not_contains() { assert "$1: does not contain '$3'" bash -c "! grep -q '$3' '$2'"; }
assert_exit_code() {
  local desc="$1" expected="$2"
  shift 2
  local actual=0
  "$@" >/dev/null 2>&1 || actual=$?
  if [ "$actual" -eq "$expected" ]; then
    echo "  ✓ $desc (exit $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: $desc (expected exit $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

mkdir -p "$PROJECT_DIR/locales" "$PROJECT_DIR/src"
cd "$PROJECT_DIR"

# ── Phase 1: Basic Sync ──────────────────────────────────────────────
echo "Phase 1: Basic Sync"

cat > locales/en.json << 'EOF'
{
  "greeting": "Hello, world!",
  "farewell": "Goodbye!",
  "welcome": "Welcome to our app, {name}.",
  "item_count": "You have %1$s items in your cart.",
  "template": "Hello {{user}}, you have {{count}} messages."
}
EOF

cat > locales/en.yaml << 'EOF'
nav:
  home: Home
  about: About Us
  contact: Contact
footer:
  copyright: All rights reserved.
EOF

cat > .deepl-sync.yaml << 'EOF'
version: 1
source_locale: en
target_locales:
  - de
  - fr
buckets:
  json:
    include:
      - "locales/en.json"
  yaml:
    include:
      - "locales/en.yaml"
EOF

deepl sync --dry-run 2>&1 | head -20
assert_exit_code "dry-run exits 0" 0 deepl sync --dry-run

deepl sync 2>&1 | head -20
assert_file_exists "de JSON target created" locales/de.json
assert_file_exists "fr JSON target created" locales/fr.json
assert_file_exists "de YAML target created" locales/de.yaml
assert_file_exists "fr YAML target created" locales/fr.yaml
assert_file_exists "lock file created" .deepl-sync.lock
echo

# ── Phase 2: Output Quality ──────────────────────────────────────────
echo "Phase 2: Verify Output Quality"

assert_file_not_contains "de.json" locales/de.json "Hello, world"
assert_file_not_contains "fr.json" locales/fr.json "Hello, world"
assert_file_contains "de.json placeholder {name}" locales/de.json '{name}'
assert_file_contains "de.json placeholder %1\$s" locales/de.json '%1$s'
assert_file_contains "de.json placeholder {{user}}" locales/de.json '{{user}}'
assert_file_contains "de.json placeholder {{count}}" locales/de.json '{{count}}'
assert_file_not_contains "de.yaml" locales/de.yaml "Home"
assert_file_contains "lock has translated status" .deepl-sync.lock '"status": "translated"'
echo

# ── Phase 3: Incremental Sync ────────────────────────────────────────
echo "Phase 3: Incremental Sync"

# Save pre-sync lock timestamp for comparison
LOCK_BEFORE=$(cat .deepl-sync.lock)

# Add a new key
cat > locales/en.json << 'EOF'
{
  "greeting": "Hello, world!",
  "farewell": "Goodbye!",
  "welcome": "Welcome to our app, {name}.",
  "item_count": "You have %1$s items in your cart.",
  "template": "Hello {{user}}, you have {{count}} messages.",
  "new_feature": "Try our brand new feature!"
}
EOF

deepl sync 2>&1 | head -10
assert_file_contains "de.json has new key" locales/de.json "new_feature"

# Modify an existing key
cat > locales/en.json << 'EOF'
{
  "greeting": "Hi there, world!",
  "farewell": "Goodbye!",
  "welcome": "Welcome to our app, {name}.",
  "item_count": "You have %1$s items in your cart.",
  "template": "Hello {{user}}, you have {{count}} messages.",
  "new_feature": "Try our brand new feature!"
}
EOF

deepl sync 2>&1 | head -10
assert_file_not_contains "de.json greeting updated" locales/de.json "Hello, world"

# Delete a key
cat > locales/en.json << 'EOF'
{
  "greeting": "Hi there, world!",
  "farewell": "Goodbye!",
  "welcome": "Welcome to our app, {name}.",
  "item_count": "You have %1$s items in your cart.",
  "template": "Hello {{user}}, you have {{count}} messages."
}
EOF

deepl sync 2>&1 | head -10
assert_file_not_contains "de.json deleted key removed" locales/de.json "new_feature"
echo

# ── Phase 4: New Locale ──────────────────────────────────────────────
echo "Phase 4: New Locale"

cat > .deepl-sync.yaml << 'EOF'
version: 1
source_locale: en
target_locales:
  - de
  - fr
  - es
buckets:
  json:
    include:
      - "locales/en.json"
  yaml:
    include:
      - "locales/en.yaml"
EOF

assert_exit_code "frozen detects new locale drift" 10 deepl sync --frozen

deepl sync 2>&1 | head -10
assert_file_exists "es JSON target created" locales/es.json
assert_file_exists "es YAML target created" locales/es.yaml
assert_file_not_contains "es.json has translation (not source)" locales/es.json "Hi there, world"

assert_exit_code "frozen passes after sync" 0 deepl sync --frozen
echo

# ── Phase 5: Status + Validate ───────────────────────────────────────
echo "Phase 5: Status + Validate"

deepl sync status 2>&1 | head -10
assert_exit_code "status exits 0" 0 deepl sync status

STATUS_JSON=$(deepl sync status --format json 2>&1)
# Wrap pipelines inside helper functions so the assert helper runs them
# atomically. Otherwise `assert "desc" echo $X | python3 ...` parses the
# pipe at the assert call level — assert sees only `echo $X` (always 0)
# and python receives assert's own "✓ desc\n" stdout instead of the JSON.
_check_status_json_valid() { printf '%s\n' "$STATUS_JSON" | python3 -c "import sys,json; json.load(sys.stdin)"; }
_check_status_source_en() { printf '%s\n' "$STATUS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['sourceLocale']=='en'"; }
assert "status JSON is valid" _check_status_json_valid
assert "status shows source locale" _check_status_source_en

assert_exit_code "validate exits 0" 0 deepl sync validate
echo

# ── Phase 6: Force + Locale Filter ───────────────────────────────────
echo "Phase 6: Force + Locale Filter"

deepl sync --force --yes --locale de 2>&1 | head -10
assert_exit_code "force+locale exits 0" 0 deepl sync --force --yes --locale de

deepl sync --dry-run --force 2>&1 | head -10
assert_exit_code "dry-run+force exits 0" 0 deepl sync --dry-run --force
echo

# ── Phase 7: PO Plurals ─────────────────────────────────────────────
echo "Phase 7: PO Format with Plurals"

mkdir -p locales/en/po
cat > locales/en/po/messages.po << 'POEOF'
# English translations
msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\n"

msgid "item"
msgid_plural "items"
msgstr[0] ""
msgstr[1] ""

msgid "greeting"
msgstr ""
POEOF

cat > .deepl-sync.yaml << 'EOF'
version: 1
source_locale: en
target_locales:
  - de
  - fr
  - es
buckets:
  json:
    include:
      - "locales/en.json"
  yaml:
    include:
      - "locales/en.yaml"
  po:
    include:
      - "locales/en/po/messages.po"
EOF

deepl sync 2>&1 | head -10
assert_file_exists "de PO target created" locales/de/po/messages.po
echo

# ── Phase 8: Android XML ────────────────────────────────────────────
echo "Phase 8: Android XML with Plurals"

mkdir -p locales/values
cat > locales/values/strings.xml << 'XMLEOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">My App</string>
    <string name="hello_user">Hello, %1$s!</string>
    <plurals name="item_count">
        <item quantity="one">%d item</item>
        <item quantity="other">%d items</item>
    </plurals>
    <string-array name="colors">
        <item>Red</item>
        <item>Blue</item>
        <item>Green</item>
    </string-array>
</resources>
XMLEOF

cat > .deepl-sync.yaml << 'EOF'
version: 1
source_locale: en
target_locales:
  - de
  - fr
  - es
buckets:
  json:
    include:
      - "locales/en.json"
  yaml:
    include:
      - "locales/en.yaml"
  android_xml:
    include:
      - "locales/values/strings.xml"
    target_path_pattern: "locales/values-{locale}/strings.xml"
EOF

deepl sync 2>&1 | head -10
echo

# ── Phase 9: Context Extraction ──────────────────────────────────────
echo "Phase 9: Context Extraction"

cat > src/App.tsx << 'TSXEOF'
import { useTranslation } from 'react-i18next';

export function App() {
  const { t } = useTranslation();
  return (
    <div>
      <h1>{t('greeting')}</h1>
      <p>{t('welcome', { name: 'User' })}</p>
      <p>{t('farewell')}</p>
    </div>
  );
}
TSXEOF

cat > .deepl-sync.yaml << 'EOF'
version: 1
source_locale: en
target_locales:
  - de
  - fr
  - es
buckets:
  json:
    include:
      - "locales/en.json"
context:
  enabled: true
  scan_paths:
    - "src/**/*.tsx"
EOF

deepl sync --force --yes --locale de 2>&1 | head -10
assert_exit_code "sync with context exits 0" 0 deepl sync --force --yes --locale de
echo

# ── Summary ──────────────────────────────────────────────────────────
echo
echo "════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo

if [ "$FAIL" -gt 0 ]; then
  echo "Some checks failed. Review output above."
  exit 1
fi

echo "=== All live validation checks passed! ==="
