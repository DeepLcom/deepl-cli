#!/bin/bash
# Example 25: Language Detection
# Demonstrates detecting the language of text using the DeepL API

set -e

echo "=== DeepL CLI Example 25: Language Detection ==="
echo

if ! deepl auth show &>/dev/null; then
  echo "Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "1. Detect language of French text:"
deepl detect "Bonjour le monde"
echo

echo "2. Detect language of German text:"
deepl detect "Hallo Welt"
echo

echo "3. Detect language of Japanese text:"
deepl detect "こんにちは世界"
echo

echo "4. JSON output format:"
deepl detect "Ciao mondo" --format json
echo

echo "5. Detect from stdin:"
echo "Hola mundo" | deepl detect
echo

echo "6. Detect from stdin with JSON output:"
echo "Die Katze sitzt auf dem Dach" | deepl detect --format json
echo

echo "7. Detect language of file content:"
TEMP_FILE="/tmp/deepl-example-25.txt"
echo "Les fleurs sont belles au printemps." > "$TEMP_FILE"
cat "$TEMP_FILE" | deepl detect
rm -f "$TEMP_FILE"
echo

echo "8. Scripting: detect then conditionally translate:"
LANG_CODE=$(deepl detect "Bonjour le monde" --format json | jq -r '.detected_language')
echo "   Detected language: $LANG_CODE"
if [ "$LANG_CODE" != "EN" ]; then
  echo "   Not English — translating:"
  deepl translate "Bonjour le monde" --to en-us
fi
echo

echo "=== Language Detection Examples Complete ==="
echo
echo "Tips:"
echo "  - Works with any text the DeepL API supports"
echo "  - Useful as a pre-processing step before translation"
echo "  - JSON format includes confidence information"
echo "  - Pipe file content via stdin: cat file.txt | deepl detect"
