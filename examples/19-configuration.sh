#!/bin/bash
# Example 19: Configuration
# Demonstrates configuration management

set -e  # Exit on error

echo "=== DeepL CLI Example 19: Configuration ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Example 1: View all configuration
echo "1. View all configuration"
deepl config list
echo

echo "1b. View configuration in text format:"
deepl config list --format text
echo

# Example 2: Get specific values
echo "2. Get specific configuration values"
echo "   Cache enabled:"
deepl config get cache.enabled
echo
echo "   Default target languages:"
deepl config get defaults.targetLangs
echo
echo "   API base URL:"
deepl config get api.baseUrl
echo

# Example 3: Set configuration values
echo "3. Set configuration values"
echo "   Setting default target languages to ES, FR, DE..."
deepl config set defaults.targetLangs es,fr,de
echo

echo "   Setting output color to false..."
deepl config set output.color false
echo

echo "   Setting cache max size to 2GB..."
deepl config set cache.maxSize 2147483648
echo

# Example 4: Verify changes
echo "4. Verify configuration changes"
echo "   Target languages:"
deepl config get defaults.targetLangs
echo
echo "   Output color:"
deepl config get output.color
echo
echo "   Cache max size:"
deepl config get cache.maxSize
echo

# Example 5: Configure cache settings
echo "5. Configure cache settings"
echo "   Disable caching..."
deepl config set cache.enabled false
echo "   Cache status:"
deepl config get cache.enabled
echo

echo "   Re-enable caching..."
deepl config set cache.enabled true
echo "   Cache status:"
deepl config get cache.enabled
echo

# Example 6: Configure API endpoint (demonstration only)
echo "6. Configure API endpoint"
echo "   The CLI auto-detects the correct endpoint from your API key:"
echo "   - Keys ending with :fx → api-free.deepl.com"
echo "   - All other keys      → api.deepl.com"
echo
echo "   For regional endpoints, set a custom base URL:"
echo "   $ deepl config set api.baseUrl https://api-jp.deepl.com"
echo
echo "   Custom/regional URLs always take priority over auto-detection."
echo

# Example 7: Reset configuration (demonstration only - not actually run)
echo "7. Reset configuration to defaults"
echo "   ⚠️  Note: This example demonstrates the command but doesn't run it"
echo "   because it would clear the API key and break subsequent examples."
echo
echo "   To reset config in real usage:"
echo "   $ deepl config reset"
echo
echo "   After reset, you'll need to set your API key again:"
echo "   $ deepl auth set-key YOUR_API_KEY"
echo

# ═══════════════════════════════════════════════════════
# AUTHENTICATION
# ═══════════════════════════════════════════════════════

echo "=== Authentication Commands ==="
echo

echo "8. Show current API key status:"
deepl auth show
echo

echo "9. Set API key from stdin (for scripts/CI):"
echo "   echo \"YOUR_API_KEY\" | deepl auth set-key --from-stdin"
echo "   deepl auth set-key --from-stdin < ~/.deepl-api-key"
echo

echo "10. Clear stored API key (not running - would break subsequent examples):"
echo "   deepl auth clear"
echo

echo "=== All configuration examples completed! ==="
echo
echo "💡 Configuration tips:"
echo "   - Config file location: ~/.config/deepl-cli/config.json"
echo "   - Use defaults.targetLangs to avoid --to flag every time"
echo "   - Disable cache if disk space is limited"
echo "   - Endpoint is auto-detected from your API key; use api.baseUrl for regional endpoints"
