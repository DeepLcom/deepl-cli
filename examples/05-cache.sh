#!/bin/bash
# Example 5: Cache Management
# Demonstrates working with the translation cache

set -e  # Exit on error

echo "=== DeepL CLI Example 5: Cache Management ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Example 1: Check initial cache stats
echo "1. Check initial cache statistics"
deepl cache stats
echo

# Example 2: Perform some translations to populate cache
echo "2. Populate cache with translations"
echo "   Translating sample texts..."
deepl translate "Hello, world!" --to es >/dev/null
deepl translate "Good morning" --to fr >/dev/null
deepl translate "How are you?" --to de >/dev/null
deepl translate "Thank you" --to ja >/dev/null
echo "   ✓ Translations completed and cached"
echo

# Example 3: Check cache stats after translations
echo "3. Check cache statistics (should show entries now)"
deepl cache stats
echo

# Example 4: Demonstrate cache hit (faster)
echo "4. Demonstrate cache hit (faster translation)"
echo "   First translation (cache miss, uses API):"
time deepl translate "The quick brown fox" --to es >/dev/null 2>&1
echo

echo "   Second translation (cache hit, instant):"
time deepl translate "The quick brown fox" --to es >/dev/null 2>&1
echo

# Example 5: Check updated cache stats
echo "5. Cache statistics after repeated translation"
deepl cache stats
echo

# Example 6: Disable cache
echo "6. Disable caching"
deepl cache disable
deepl cache stats
echo

# Example 7: Translate with cache disabled (always hits API)
echo "7. Translate with cache disabled (slower)"
echo "   Translation without cache:"
time deepl translate "Hello again" --to es 2>&1 | head -5
echo

# Example 8: Re-enable cache
echo "8. Re-enable caching"
deepl cache enable
deepl cache stats
echo

# Example 9: Clear cache
echo "9. Clear all cached translations"
deepl cache clear
echo

# Example 10: Verify cache is empty
echo "10. Verify cache is empty"
deepl cache stats
echo

echo "=== All cache examples completed! ==="
echo
echo "💡 Cache benefits:"
echo "   - Instant results for repeated translations"
echo "   - Reduces API calls (saves quota)"
echo "   - Works offline for cached translations"
echo "   - Default: 1GB max size, 30-day TTL"
echo
echo "📍 Cache location: ~/.deepl-cli/cache.db"
