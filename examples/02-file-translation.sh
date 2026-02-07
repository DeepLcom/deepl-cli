#!/bin/bash
# Example 2: File Translation & Caching
# Demonstrates translating files with format preservation and smart caching

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

# Example 6: Smart caching for text files
echo "6. Smart caching for text-based files"
echo "   Text files under 100 KiB are automatically cached for fast repeated translations"
echo

# Create HTML file
cat > "$SAMPLE_DIR/page.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>Sample Page</title>
</head>
<body>
  <h1>Welcome</h1>
  <p>This HTML file demonstrates smart caching for text-based formats.</p>
</body>
</html>
EOF

# Create SRT subtitle file
cat > "$SAMPLE_DIR/subtitles.srt" << 'EOF'
1
00:00:00,000 --> 00:00:02,000
Welcome to the video

2
00:00:02,000 --> 00:00:05,000
This subtitle file is cached automatically
EOF

echo "   Created additional text-based files:"
echo "   - page.html (HTML format)"
echo "   - subtitles.srt (subtitle format)"
echo

# Example 7: Translate HTML (cached)
echo "7. Translate HTML file (uses cached text API)"
deepl translate "$SAMPLE_DIR/page.html" --to de --output "$OUTPUT_DIR/page.de.html"
echo "   ✓ Translated page.html to German"
echo

# Example 8: Translate SRT (cached)
echo "8. Translate subtitle file (uses cached text API)"
deepl translate "$SAMPLE_DIR/subtitles.srt" --to ja --output "$OUTPUT_DIR/subtitles.ja.srt"
echo "   ✓ Translated subtitles.srt to Japanese"
echo

# Example 9: Cache effectiveness demonstration
echo "9. Cache effectiveness (translate same file twice)"
echo "   Clearing cache first..."
deepl cache clear --yes &>/dev/null || true
echo "   ✓ Cache cleared"
echo

echo "   First translation (API call - not cached):"
time deepl translate "$SAMPLE_DIR/sample.txt" --to es --output "$OUTPUT_DIR/sample.cached.1.txt" 2>&1 | grep -v "^$" | tail -1
echo

echo "   Second translation (from cache - instant):"
time deepl translate "$SAMPLE_DIR/sample.txt" --to es --output "$OUTPUT_DIR/sample.cached.2.txt" 2>&1 | grep -v "^$" | tail -1
echo

echo "   Note: Second translation is much faster due to caching!"
echo

# Example 10: Large file fallback
echo "10. Large file automatic fallback (>100 KiB)"
echo "    Creating a large text file (>100 KiB)..."

# Generate approximately 110 KiB of text
{
  echo "Large Text File - Over 100 KiB"
  echo
  for i in {1..3000}; do
    echo "Line $i: This is a sample line of text that will make the file exceed the 100 KiB caching threshold."
  done
} > "$SAMPLE_DIR/large.txt"

FILE_SIZE=$(du -h "$SAMPLE_DIR/large.txt" | cut -f1)
echo "    File size: $FILE_SIZE"
echo
echo "    Translating (should show warning about falling back to document API):"
deepl translate "$SAMPLE_DIR/large.txt" --to es --output "$OUTPUT_DIR/large.es.txt"
echo

# Example 11: Cache statistics
echo "11. Cache statistics"
deepl cache stats
echo

echo "=== All file translation examples completed! ==="
echo
echo "Summary:"
echo "  ✓ Basic file translation (.txt, .md)"
echo "  ✓ Multiple target languages"
echo "  ✓ Code preservation in markdown"
echo "  ✓ Formality control"
echo "  ✓ Smart caching for small text files (<100 KiB)"
echo "  ✓ Multiple text formats (.html, .srt)"
echo "  ✓ Automatic fallback for large files (>100 KiB)"
echo "  ✓ Cache performance benefits"
echo

# Cleanup
echo "Cleaning up temporary files..."
rm -rf /tmp/deepl-example-02
echo "✓ Cleanup complete"

echo "=== All examples completed successfully! ==="
