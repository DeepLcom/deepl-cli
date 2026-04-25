#!/bin/bash
# Example 30: Sync — Basic Usage
# Demonstrates scanning, diffing, and syncing i18n locale files

set -e  # Exit on error

echo "=== DeepL CLI Example 30: Sync — Basic Usage ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "API key configured"
echo

# Setup: Create a test project with i18n files
PROJECT_DIR="/tmp/deepl-sync-demo"
rm -rf "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR/locales"

cleanup() {
  rm -rf "$PROJECT_DIR"
}
trap cleanup EXIT

echo "Created test project: $PROJECT_DIR"
echo

# Example 1: Create source locale files
echo "1. Create source locale files"
cat > "$PROJECT_DIR/locales/en.json" << 'EOF'
{
  "greeting": "Hello, world!",
  "farewell": "Goodbye!",
  "welcome": "Welcome to our application, {name}.",
  "items_count": "You have {count} items in your cart.",
  "error": {
    "not_found": "The requested page was not found.",
    "unauthorized": "You must be logged in to access this resource."
  }
}
EOF

echo "   Created locales/en.json with 6 strings"
echo

# Example 2: Initialize sync configuration
echo "2. Initialize sync configuration"
cd "$PROJECT_DIR"

deepl sync init \
  --source-locale en \
  --target-locales de,fr,es \
  --file-format json \
  --path "locales/en.json"

echo
echo "   Created .deepl-sync.yaml"
echo "   Contents:"
cat "$PROJECT_DIR/.deepl-sync.yaml"
echo

# Example 3: Dry-run to preview changes
echo "3. Preview what would be translated (dry-run)"
deepl sync --dry-run
echo

# Example 4: Run the sync
echo "4. Sync translations"
deepl sync
echo

echo "   Generated target files:"
ls -la "$PROJECT_DIR/locales/"
echo

# Example 5: Check translation status
echo "5. Check translation status"
deepl sync status
echo

# Example 6: Validate translations
echo "6. Validate translation integrity"
if ! deepl sync validate; then
  echo "   (Validation found issues — e.g. placeholder mismatches from translation)"
fi
echo

# Example 7: Add a new string and re-sync
echo "7. Add a new string and re-sync (incremental)"
cat > "$PROJECT_DIR/locales/en.json" << 'EOF'
{
  "greeting": "Hello, world!",
  "farewell": "Goodbye!",
  "welcome": "Welcome to our application, {name}.",
  "items_count": "You have {count} items in your cart.",
  "new_feature": "Check out our brand new feature!",
  "error": {
    "not_found": "The requested page was not found.",
    "unauthorized": "You must be logged in to access this resource."
  }
}
EOF

echo "   Added 'new_feature' key to en.json"
echo "   Running incremental sync (only new/changed strings)..."
deepl sync
echo

# Example 8: Sync a specific locale
echo "8. Sync a specific locale"
deepl sync --locale de
echo

# Example 9: Force re-translate all strings
echo "9. Force re-translate (ignores lockfile)"
deepl sync --force --yes --locale fr
echo

# Example 10: JSON output for scripting
echo "10. JSON output for scripting"
deepl sync status --format json
echo

# Example 11: Export source strings to XLIFF
echo "11. Export source strings to XLIFF for CAT tool handoff"
# `--output` is resolved relative to the sync project root. Use a relative
# path here to sidestep macOS symlink mismatches (/tmp → /private/tmp), which
# would otherwise make an absolute /tmp/... path appear to escape the
# /private/tmp/... project root that loadSyncConfig sees.
deepl sync export --output handoff.xlf
echo "   Wrote $PROJECT_DIR/handoff.xlf"
# Re-running requires --overwrite:
#   deepl sync export --output handoff.xlf --overwrite
echo

echo "=== Sync Features ==="
echo
echo "File scanning:"
echo "  - Detects i18n files from .deepl-sync.yaml bucket patterns"
echo "  - Supports JSON, YAML, PO, Android XML, iOS Strings, ARB, XLIFF"
echo "  - Multiple buckets for mixed-format projects"
echo
echo "Incremental sync:"
echo "  - Lockfile (.deepl-sync.lock) tracks content hashes"
echo "  - Only new and changed strings are sent to the API"
echo "  - Deleted keys are removed from target files"
echo
echo "Translation quality:"
echo "  - Formality control (--formality)"
echo "  - Glossary support (--glossary)"
echo "  - Auto-context extraction from source code"
echo "  - Model type selection (--model-type)"
echo "  - Translation memory (translation.translation_memory in .deepl-sync.yaml)"
echo

cat <<'EOF'
Translation memory (YAML config shape; no CLI override on sync):

    translation:
      model_type: quality_optimized          # required when using translation memory
      translation_memory: my-tm              # name or UUID; resolved once per run
      translation_memory_threshold: 80       # optional; 0-100 integer, default 75
      locale_overrides:
        de:
          translation_memory: de-specific-tm # per-locale override wins over top-level
        fr:
          translation_memory_threshold: 90   # threshold-only override; inherits top-level TM

EOF

echo "Validation:"
echo "  - Placeholder integrity checks ({name}, %d, etc.)"
echo "  - Format string consistency"
echo "  - HTML/XML tag balance"
echo "  - ICU message syntax validation"
echo
echo "Use cases:"
echo "  - Local development with real-time localization updates"
echo "  - CI/CD pipelines with --frozen mode (exit code 10 for drift)"
echo "  - Multi-platform projects (web + mobile in one config)"
echo "  - Incremental translation for large projects"
echo

echo "=== All examples completed successfully! ==="
