#!/bin/bash
# Example 23: API Usage Monitoring
# Demonstrates checking API character usage and quota

set -e  # Exit on error

echo "=== DeepL CLI Example 23: API Usage Monitoring ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Example 1: Check initial API usage
echo "1. Check current API usage statistics"
deepl usage
echo

# Example 2: Perform some translations
echo "2. Perform sample translations"
echo "   Translating texts..."
deepl translate "Hello, world!" --to es >/dev/null
deepl translate "Good morning" --to fr >/dev/null
deepl translate "How are you today?" --to de >/dev/null
deepl translate "This is a longer text that will consume more characters from the API quota." --to ja >/dev/null
echo "   ✓ Translations completed"
echo

# Example 3: Check updated usage
echo "3. Check updated API usage (after translations)"
deepl usage
echo

# Example 4: Demonstrate usage monitoring in scripts
echo "4. Usage monitoring in automated scripts"
echo "   Example: Check if quota is running low before batch operations"
echo
cat << 'EOF'
# Bash script snippet for quota checking:
if deepl usage 2>&1 | grep -q "80.*%"; then
  echo "⚠️  Warning: API quota above 80%"
  echo "Consider pausing translations or upgrading plan"
fi
EOF
echo

echo "5. Usage in JSON format (for scripting):"
deepl usage --format json
echo

echo "6. Usage in text format:"
deepl usage --format text
echo

echo "=== Usage monitoring example completed! ==="
echo

echo "💡 Usage monitoring benefits:"
echo "   - Track character consumption"
echo "   - Avoid exceeding quota limits"
echo "   - Plan upgrades based on usage patterns"
echo "   - Monitor API costs"
echo

echo "📊 Usage tips:"
echo "   - Check usage regularly in production"
echo "   - Set up alerts when usage exceeds 80%"
echo "   - Use caching to reduce API calls"
echo "   - Monitor usage before large batch operations"
echo

echo "⚠️  Account limits:"
echo "   - Free tier: typically 500,000 chars/month"
echo "   - Pro accounts: varies by subscription"
echo "   - Usage resets monthly"
echo

echo "=== All examples completed successfully! ==="
