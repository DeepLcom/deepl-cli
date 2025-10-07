#!/bin/bash
# Example 2: File Translation
# Demonstrates translating files with format preservation

set -e  # Exit on error

echo "=== DeepL CLI Example 2: File Translation ==="
echo

# Setup: Create sample files
SAMPLE_DIR="examples/sample-files"
OUTPUT_DIR="examples/output"

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

# Example 2: Translate to multiple languages
echo "2. Translate text file to multiple languages (EN → ES, FR, DE)"
deepl translate "$SAMPLE_DIR/sample.txt" --to es,fr,de --output "$OUTPUT_DIR/"
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
grep -A 1 '```bash' "$SAMPLE_DIR/sample.md"
echo
echo "   Translated code block (should be identical):"
grep -A 1 '```bash' "$OUTPUT_DIR/sample.ja.md"
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
echo "📁 Check the output directory: $OUTPUT_DIR"
