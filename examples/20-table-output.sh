#!/bin/bash
# Example 20: Table Output Format
# Demonstrates structured table output for comparing translations across multiple languages

set -e  # Exit on error

echo "=== DeepL CLI Example 20: Table Output Format ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

echo "Table format provides a structured view of translations across multiple languages,"
echo "showing language codes, translated text, and billed character counts."
echo

# Create temporary directory for examples
TEMP_DIR="/tmp/deepl-example-20"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

echo "1. Basic table output - multiple languages"
echo "   Command: deepl translate \"Hello, world!\" --to es,fr,de --format table --show-billed-characters --no-cache"
echo
deepl translate "Hello, world!" --to es,fr,de --format table --show-billed-characters --no-cache
echo

echo "2. Long text with automatic word wrapping"
echo "   Command: deepl translate \"<long text>\" --to es,fr --format table --show-billed-characters --no-cache"
echo
deepl translate "This is a longer sentence that demonstrates how the table format handles word wrapping automatically when translations exceed the column width, making it easier to read multi-language results." --to es,fr --format table --show-billed-characters --no-cache
echo

echo "3. Technical content comparison"
echo "   Useful for comparing how technical terms are translated across languages"
echo
deepl translate "The API endpoint returns a JSON response with authentication tokens." --to es,de,ja --format table --show-billed-characters --no-cache
echo

echo "4. Table output with cost tracking"
echo "   Using --show-billed-characters to see exact character counts"
echo
deepl translate "Cost transparency" --to es,fr,de,it --format table --show-billed-characters --no-cache
echo

echo "5. Comparing formality levels across languages"
echo "   Formal version:"
deepl translate "How are you?" --to es,fr,de --formality more --format table --show-billed-characters --no-cache
echo
echo "   Informal version:"
deepl translate "How are you?" --to es,fr,de --formality less --format table --show-billed-characters --no-cache
echo

echo "6. Multiple language comparison for quality assurance"
echo "   Great for spot-checking translation consistency"
echo
deepl translate "Welcome to our application" --to es,fr,de,it,pt,ja --format table --show-billed-characters --no-cache
echo

echo "7. Table without character counts (cleaner view)"
echo "   Omitting --show-billed-characters gives more space to translations"
echo
deepl translate "This is a longer sentence to show how the table uses extra space when character counts are not needed." --to es,fr,de --format table --no-cache
echo

echo "📊 Use Cases for Table Format:"
echo
echo "   ✓ Compare translations side-by-side across multiple languages"
echo "   ✓ Track billed characters for cost analysis and budget planning"
echo "   ✓ Generate human-readable translation reports"
echo "   ✓ Quality assurance - spot-check consistency across languages"
echo "   ✓ Documentation - create visual translation comparison tables"
echo "   ✓ Project management - track translation progress across locales"
echo

echo "💡 Tips:"
echo
echo "   • Table format requires multiple target languages (2 or more)"
echo "   • Use --show-billed-characters to display the Characters column"
echo "   • Without --show-billed-characters, the table is cleaner with more space for translations"
echo "   • Long translations automatically wrap within the Translation column"
echo "   • Combine with formality options to compare formal vs informal translations"
echo "   • Perfect for generating reports in CI/CD pipelines"
echo

echo "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"
echo "✓ Cleanup complete"

echo "=== All examples completed successfully! ==="
