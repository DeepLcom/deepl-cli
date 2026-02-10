#!/bin/bash
# Example 25: Structured File Translation (JSON/YAML)
# Demonstrates translating i18n locale files while preserving structure

set -e  # Exit on error

echo "=== DeepL CLI Example 25: Structured File Translation ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "API key configured"
echo

# Setup temp directory
SAMPLE_DIR="/tmp/deepl-example-25"
rm -rf "$SAMPLE_DIR"
mkdir -p "$SAMPLE_DIR"

# ── 1. Basic JSON translation ──────────────────────────────────

echo "1. Translate a JSON locale file"

cat > "$SAMPLE_DIR/en.json" << 'EOF'
{
  "greeting": "Hello",
  "farewell": "Goodbye",
  "welcome_message": "Welcome to our application"
}
EOF

deepl translate "$SAMPLE_DIR/en.json" --to es --output "$SAMPLE_DIR/es.json"
echo "   Input:  $SAMPLE_DIR/en.json"
echo "   Output: $SAMPLE_DIR/es.json"
cat "$SAMPLE_DIR/es.json"
echo

# ── 2. Nested JSON with non-string values preserved ────────────

echo "2. Nested JSON (non-string values preserved)"

cat > "$SAMPLE_DIR/app.json" << 'EOF'
{
  "app": {
    "title": "My Application",
    "version": 2,
    "settings": {
      "theme_label": "Choose your theme",
      "max_retries": 3,
      "enabled": true
    },
    "errors": {
      "not_found": "Page not found",
      "unauthorized": "You are not authorized"
    }
  }
}
EOF

deepl translate "$SAMPLE_DIR/app.json" --to de --output "$SAMPLE_DIR/app.de.json"
echo "   Numbers, booleans, and nesting preserved:"
cat "$SAMPLE_DIR/app.de.json"
echo

# ── 3. YAML locale file ────────────────────────────────────────

echo "3. Translate a YAML locale file"

cat > "$SAMPLE_DIR/en.yaml" << 'EOF'
# Application strings
nav:
  home: Home
  about: About Us
  contact: Contact

# User-facing messages
messages:
  welcome: Welcome back!
  logout: You have been logged out
EOF

deepl translate "$SAMPLE_DIR/en.yaml" --to fr --output "$SAMPLE_DIR/fr.yaml"
echo "   YAML comments are preserved in output:"
cat "$SAMPLE_DIR/fr.yaml"
echo

# ── 4. JSON indentation preserved ──────────────────────────────

echo "4. JSON indentation is auto-detected and preserved"

# 4-space indented JSON
cat > "$SAMPLE_DIR/four-space.json" << 'EOF'
{
    "title": "Four-space indented file",
    "description": "Indentation is preserved"
}
EOF

deepl translate "$SAMPLE_DIR/four-space.json" --to ja --output "$SAMPLE_DIR/four-space.ja.json"
echo "   4-space indent preserved:"
head -3 "$SAMPLE_DIR/four-space.ja.json"
echo

# ── 5. Multi-target translation ─────────────────────────────────

echo "5. Translate to multiple languages at once"

cat > "$SAMPLE_DIR/strings.json" << 'EOF'
{
  "button_save": "Save",
  "button_cancel": "Cancel",
  "button_delete": "Delete"
}
EOF

for lang in es fr de ja; do
  deepl translate "$SAMPLE_DIR/strings.json" --to "$lang" --output "$SAMPLE_DIR/strings.$lang.json"
  echo "   strings.$lang.json created"
done
echo

# ── 6. Formality control ───────────────────────────────────────

echo "6. Formal vs informal translations"

cat > "$SAMPLE_DIR/greetings.json" << 'EOF'
{
  "greeting": "How are you doing?",
  "request": "Please send us your feedback"
}
EOF

deepl translate "$SAMPLE_DIR/greetings.json" --to de --formality more --output "$SAMPLE_DIR/greetings.formal.de.json"
deepl translate "$SAMPLE_DIR/greetings.json" --to de --formality less --output "$SAMPLE_DIR/greetings.informal.de.json"
echo "   Formal:"
cat "$SAMPLE_DIR/greetings.formal.de.json"
echo "   Informal:"
cat "$SAMPLE_DIR/greetings.informal.de.json"
echo

# ── 7. Real-world i18n workflow ─────────────────────────────────

echo "7. Real-world i18n workflow: translate entire locale directory"

LOCALE_DIR="$SAMPLE_DIR/locales"
mkdir -p "$LOCALE_DIR/en"

cat > "$LOCALE_DIR/en/common.json" << 'EOF'
{
  "app_name": "Task Manager",
  "nav": {
    "dashboard": "Dashboard",
    "tasks": "Tasks",
    "settings": "Settings"
  },
  "actions": {
    "save": "Save",
    "cancel": "Cancel",
    "confirm": "Are you sure?"
  }
}
EOF

cat > "$LOCALE_DIR/en/errors.json" << 'EOF'
{
  "network": "Network error. Please try again.",
  "not_found": "The requested resource was not found.",
  "forbidden": "You do not have permission to access this resource."
}
EOF

for lang in es fr de; do
  mkdir -p "$LOCALE_DIR/$lang"
  for file in "$LOCALE_DIR/en/"*.json; do
    basename=$(basename "$file")
    deepl translate "$file" --to "$lang" --output "$LOCALE_DIR/$lang/$basename"
  done
  echo "   $lang/ created with $(ls "$LOCALE_DIR/$lang/" | wc -l | tr -d ' ') files"
done
echo

echo "   Locale directory structure:"
find "$LOCALE_DIR" -name "*.json" | sort
echo

# Cleanup
echo "Cleaning up temporary files..."
rm -rf /tmp/deepl-example-25
echo "Cleanup complete"

echo "=== All examples completed successfully! ==="
