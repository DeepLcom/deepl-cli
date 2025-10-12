#!/bin/bash
# Example 2: File Translation
# Demonstrates translating files with format preservation

set -e  # Exit on error

echo "=== DeepL CLI Example 2: File Translation ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Setup: Create sample files in temp directory
SAMPLE_DIR="/tmp/deepl-example-02/sample-files"
OUTPUT_DIR="/tmp/deepl-example-02/output"

rm -rf /tmp/deepl-example-02
mkdir -p "$SAMPLE_DIR" "$OUTPUT_DIR"

# Create sample text file
cat > "$SAMPLE_DIR/sample.txt" << 'EOF'
Welcome to DeepL CLI

This is a sample document for demonstrating file translation.
DeepL CLI makes it easy to translate entire files while preserving formatting.

Key Features:
- High-quality translation
- Format preservation
- Multi-language support
- Local caching for faster results
EOF

# Create sample markdown file
cat > "$SAMPLE_DIR/sample.md" << 'EOF'
# DeepL CLI Documentation

## Introduction

DeepL CLI is a command-line tool for translating text and files.

## Features

- **High Quality**: Uses DeepL's next-gen LLM
- **Fast**: Local caching for instant repeated translations
- **Developer Friendly**: Git hooks, watch mode, CI/CD integration

## Code Example

```bash
deepl translate "Hello" --to es
```

The code above translates "Hello" to Spanish.
EOF

echo "✓ Sample files created"
echo

# Example 1: Translate text file to single language
echo "1. Translate text file (EN → ES)"
deepl translate "$SAMPLE_DIR/sample.txt" --to es --output "$OUTPUT_DIR/sample.es.txt"
echo "   Output: $OUTPUT_DIR/sample.es.txt"
echo

# Example 2: Translate to multiple languages (sequential)
echo "2. Translate text file to multiple languages (EN → ES, FR, DE)"
echo "   Note: Document translation requires separate requests per language"
deepl translate "$SAMPLE_DIR/sample.txt" --to es --output "$OUTPUT_DIR/sample.es.txt"
deepl translate "$SAMPLE_DIR/sample.txt" --to fr --output "$OUTPUT_DIR/sample.fr.txt"
deepl translate "$SAMPLE_DIR/sample.txt" --to de --output "$OUTPUT_DIR/sample.de.txt"
echo "   Outputs created in $OUTPUT_DIR/"
ls -1 "$OUTPUT_DIR"/sample.*.txt
echo

# Example 3: Translate markdown with code preservation
echo "3. Translate markdown with code block preservation"
deepl translate "$SAMPLE_DIR/sample.md" --to ja --output "$OUTPUT_DIR/sample.ja.md" --preserve-code
echo "   Output: $OUTPUT_DIR/sample.ja.md"
echo

# Example 4: Show the translated markdown has preserved code
echo "4. Verify code blocks are preserved:"
echo "   Original code block:"
grep -A 2 '```' "$SAMPLE_DIR/sample.md" | head -4
echo
echo "   Translated file:"
if grep -q '```' "$OUTPUT_DIR/sample.ja.md"; then
  echo "   ✓ Code block markers preserved"
  grep -A 2 '```' "$OUTPUT_DIR/sample.ja.md" | head -4
else
  echo "   ⚠️  Note: Code blocks were translated (DeepL API behavior)"
  echo "   The --preserve-code flag helps but may not catch all cases"
fi
echo

# Example 5: Translate with formality
echo "5. Translate with formal tone"
cat > "$SAMPLE_DIR/informal.txt" << 'EOF'
Hey there!
How's it going? Hope you're doing well.
EOF

deepl translate "$SAMPLE_DIR/informal.txt" --to de --formality more --output "$OUTPUT_DIR/formal.de.txt"
echo "   Output: $OUTPUT_DIR/formal.de.txt"
cat "$OUTPUT_DIR/formal.de.txt"
echo

echo "=== All file translation examples completed! ==="
echo

# Cleanup
echo "Cleaning up temporary files..."
rm -rf /tmp/deepl-example-02
echo "✓ Cleanup complete"

echo "=== All examples completed successfully! ==="
