#!/bin/bash
# Example 4: Configuration
# Demonstrates configuration management

set -e  # Exit on error

echo "=== DeepL CLI Example 4: Configuration ==="
echo

# Example 1: View all configuration
echo "1. View all configuration"
deepl config list
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

# Example 6: Configure API endpoint (for Pro accounts)
echo "6. Configure API endpoint"
echo "   Current API endpoint:"
deepl config get api.baseUrl
echo

echo "   Setting to Pro endpoint (example, revert after):"
deepl config set api.baseUrl https://api.deepl.com/v2
echo "   New API endpoint:"
deepl config get api.baseUrl
echo

echo "   Reverting to Free endpoint:"
deepl config set api.baseUrl https://api-free.deepl.com/v2
echo

# Example 7: Reset configuration
echo "7. Reset configuration to defaults"
echo "   Resetting..."
deepl config reset
echo

echo "   Verifying reset - target languages should be empty:"
deepl config get defaults.targetLangs
echo

echo "   Verifying reset - cache should be enabled:"
deepl config get cache.enabled
echo

echo "=== All configuration examples completed! ==="
echo
echo "💡 Configuration tips:"
echo "   - Config file location: ~/.deepl-cli/config.json"
echo "   - Use defaults.targetLangs to avoid --to flag every time"
echo "   - Disable cache if disk space is limited"
echo "   - Use api.baseUrl to switch between Free and Pro APIs"
