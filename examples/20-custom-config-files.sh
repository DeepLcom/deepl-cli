#!/bin/bash
# Example 20: Custom Configuration Files
# Demonstrates using --config flag for multiple configurations

set -e  # Exit on error

echo "=== DeepL CLI Example 20: Custom Configuration Files ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Create temporary directory for config files
CONFIG_DIR=/tmp/deepl-example-20
mkdir -p "$CONFIG_DIR"

echo "=== Creating Multiple Configuration Files ==="
echo

# Create work config (formal translations)
cat > "$CONFIG_DIR/work-config.json" <<'EOF'
{
  "auth": {
    "apiKey": null
  },
  "api": {
    "baseUrl": "https://api.deepl.com",
    "usePro": true
  },
  "defaults": {
    "sourceLang": "en",
    "targetLangs": ["de", "fr"],
    "formality": "more",
    "preserveFormatting": true
  },
  "cache": {
    "enabled": true,
    "maxSize": 524288000,
    "ttl": 2592000
  },
  "output": {
    "format": "text",
    "verbose": false,
    "color": true
  },
  "watch": {
    "debounceMs": 500,
    "autoCommit": false,
    "pattern": "*.md"
  },
  "team": {
    "org": "work-org",
    "workspace": "engineering"
  }
}
EOF

echo "Created work-config.json (formal translations, de/fr targets)"

# Create personal config (casual translations)
cat > "$CONFIG_DIR/personal-config.json" <<'EOF'
{
  "auth": {
    "apiKey": null
  },
  "api": {
    "baseUrl": "https://api.deepl.com",
    "usePro": true
  },
  "defaults": {
    "sourceLang": null,
    "targetLangs": ["es", "ja"],
    "formality": "default",
    "preserveFormatting": true
  },
  "cache": {
    "enabled": true,
    "maxSize": 1073741824,
    "ttl": 2592000
  },
  "output": {
    "format": "text",
    "verbose": false,
    "color": true
  },
  "watch": {
    "debounceMs": 300,
    "autoCommit": false,
    "pattern": "*.md"
  },
  "team": {
    "org": null,
    "workspace": null
  }
}
EOF

echo "Created personal-config.json (default formality, es/ja targets)"
echo

echo "=== 1. Viewing Configuration Files ==="
echo

echo "Work config defaults:"
deepl --config "$CONFIG_DIR/work-config.json" config get defaults.formality
deepl --config "$CONFIG_DIR/work-config.json" config get defaults.targetLangs
echo

echo "Personal config defaults:"
deepl --config "$CONFIG_DIR/personal-config.json" config get defaults.formality
deepl --config "$CONFIG_DIR/personal-config.json" config get defaults.targetLangs
echo

echo "=== 2. Using Different Configs for Translation ==="
echo

# Note: In a real scenario, you would set the API key in each config file
# For this example, we'll just demonstrate the config switching mechanism
echo "💡 Tip: In practice, each config file would have its own API key:"
echo "   deepl --config work-config.json auth set-key WORK_API_KEY"
echo "   deepl --config personal-config.json auth set-key PERSONAL_API_KEY"
echo

echo "=== 3. Setting Values in Specific Config Files ==="
echo

echo "Setting custom value in work config..."
deepl --config "$CONFIG_DIR/work-config.json" config set cache.maxSize 104857600
echo "✓ Set cache.maxSize = 104857600 (100MB) in work config"
echo

echo "Verifying work config:"
deepl --config "$CONFIG_DIR/work-config.json" config get cache.maxSize
echo

echo "Verifying personal config (should be unchanged):"
deepl --config "$CONFIG_DIR/personal-config.json" config get cache.maxSize
echo

echo "=== 4. Real-World Use Cases ==="
echo

echo "📁 **Project-Specific Configs**"
echo "   Store .deepl.json in your project root with project settings"
echo "   $ deepl --config ./.deepl.json translate docs/ --to es --output docs-es/"
echo

echo "🔧 **Environment-Specific Configs**"
echo "   dev-config.json   → Development API key, verbose logging"
echo "   prod-config.json  → Production API key, quiet mode"
echo "   $ deepl --quiet --config prod-config.json translate ..."
echo

echo "👥 **Team Configurations**"
echo "   Commit shared-config.json to version control (without API key)"
echo "   Team members use: deepl --config shared-config.json ..."
echo "   Each member sets their own API key in the shared config"
echo

echo "🧪 **Testing**"
echo "   test-config.json → Test API key, separate cache"
echo "   $ deepl --config test-config.json translate "Test" --to es"
echo

echo "=== 5. Config File Precedence ==="
echo

echo "Priority (highest to lowest):"
echo "  1. --config flag (highest priority)"
echo "  2. DEEPL_CONFIG_DIR environment variable"
echo "  3. Default location (~/.config/deepl-cli/config.json)"
echo

echo "Example with precedence:"
echo "  $ export DEEPL_CONFIG_DIR=/custom/dir"
echo "  $ deepl --config work-config.json translate 'Hello' --to es"
echo "  # Uses work-config.json (--config overrides DEEPL_CONFIG_DIR)"
echo

echo "Cleaning up temporary files..."
rm -rf "$CONFIG_DIR"
echo "✓ Cleanup complete"

echo
echo "=== All examples completed successfully! ==="
