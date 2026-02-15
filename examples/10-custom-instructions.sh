#!/bin/bash
# Example 10: Custom Instructions
# Use custom instructions to guide DeepL translations with specific rules

set -e

echo "=== DeepL CLI Example 10: Custom Instructions ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# 1. Single custom instruction
echo "1. Single custom instruction"
echo "   Translating UI string with software context..."
deepl translate "Click Save to confirm your changes" --to de \
  --custom-instruction "This is a software UI string - keep it concise"
echo
echo "   Tip: Custom instructions help DeepL understand your content's domain."
echo

# 2. Multiple custom instructions (up to 10)
echo "2. Multiple custom instructions"
echo "   Translating with domain + style guidance..."
deepl translate "The patient presented with acute symptoms" --to fr \
  --custom-instruction "This is a medical document" \
  --custom-instruction "Use formal medical terminology"
echo
echo "   Tip: Each instruction can be up to 300 characters."
echo

# 3. Brand name preservation
echo "3. Preserving brand names"
echo "   Translating marketing copy..."
deepl translate "Experience the power of DeepL Pro for your enterprise" --to es \
  --custom-instruction "Keep brand names unchanged: DeepL, DeepL Pro"
echo

# 4. Combine with formality
echo "4. Combining with formality settings"
echo "   Formal business translation with custom guidance..."
deepl translate "We look forward to working with you" --to de \
  --custom-instruction "This is a formal business letter" \
  --formality more
echo

# 5. Technical translation
echo "5. Technical domain translation"
deepl translate "The API returns a 403 status code when the token expires" --to ja \
  --custom-instruction "This is technical API documentation" \
  --custom-instruction "Keep HTTP status codes and technical terms in English"
echo

echo "6. Style rules (Pro API only):"
echo "   Use --style-id with a pre-configured style rule UUID:"
echo "   deepl translate \"Hello world\" --to de --style-id \"a1b2c3d4-e5f6-7890-abcd-ef1234567890\""
echo
echo "   Note: Style IDs are created and managed via the DeepL Pro dashboard."
echo "   When --style-id is used, the model is automatically set to quality_optimized."
echo "   Style IDs and --custom-instruction cannot be combined."
echo

echo "=== All examples completed successfully! ==="
