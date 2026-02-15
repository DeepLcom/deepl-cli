#!/bin/bash
# Example 5: Document Translation
# Demonstrates translating complete documents while preserving formatting

set -e  # Exit on error

echo "=== DeepL CLI Example 5: Document Translation ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Create temporary directory for test files
TEST_DIR="/tmp/deepl-example-05"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"

echo "=== Document Translation Examples ==="
echo
echo "DeepL CLI supports translating complete documents while preserving:"
echo "  • Formatting (fonts, styles, colors)"
echo "  • Layout (page structure, margins)"
echo "  • Structure (headings, lists, tables)"
echo "  • Metadata (document properties)"
echo
echo "Supported formats: PDF, DOCX, PPTX, XLSX, HTML, TXT, SRT, XLF, XLIFF"
echo

# Example 1: HTML Document Translation
echo "1. Translating HTML document"
echo
echo "Creating a sample HTML document..."
cat > "$TEST_DIR/sample.html" <<'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Test Document</title>
</head>
<body>
    <h1>Welcome to DeepL CLI</h1>
    <p>This is a test document for document translation.</p>
    <p>The DeepL API can translate various document formats including HTML, PDF, DOCX, and more.</p>
</body>
</html>
EOF

echo "✓ Created sample.html"
echo
echo "Translating to Spanish..."
deepl translate "$TEST_DIR/sample.html" --to es --output "$TEST_DIR/sample.es.html"
echo
echo "✓ Translation complete!"
echo
echo "Original content:"
grep -A 1 "<h1>" "$TEST_DIR/sample.html" || true
echo
echo "Translated content:"
grep -A 1 "<h1>" "$TEST_DIR/sample.es.html" || true
echo

# Example 2: Plain Text Document
echo "2. Translating text document with multiple languages"
echo
echo "Creating a sample text document..."
cat > "$TEST_DIR/readme.txt" <<'EOF'
Getting Started with DeepL CLI

DeepL CLI is a powerful command-line tool for translation and writing enhancement.

Key Features:
- High-quality neural machine translation
- Support for multiple document formats
- Glossary management for consistent terminology
- Context-aware translation
- Real-time file watching

Installation:
npm install -g deepl-cli

Usage:
deepl translate "Hello, world!" --to es
EOF

echo "✓ Created readme.txt"
echo
echo "Translating to German and French..."
deepl translate "$TEST_DIR/readme.txt" --to de --output "$TEST_DIR/readme.de.txt"
deepl translate "$TEST_DIR/readme.txt" --to fr --output "$TEST_DIR/readme.fr.txt"
echo
echo "✓ Translations complete!"
echo
echo "German version (first 3 lines):"
head -n 3 "$TEST_DIR/readme.de.txt"
echo
echo "French version (first 3 lines):"
head -n 3 "$TEST_DIR/readme.fr.txt"
echo

# Example 3: Document with Formality
echo "3. Translating document with formality control"
echo
echo "Creating a formal letter..."
cat > "$TEST_DIR/letter.txt" <<'EOF'
Dear Sir or Madam,

I am writing to inquire about your translation services.
We are interested in translating our technical documentation into multiple languages.

Could you please provide information about:
- Supported document formats
- Pricing structure
- Turnaround times

Thank you for your attention to this matter.

Sincerely,
John Smith
EOF

echo "✓ Created letter.txt"
echo
echo "Translating to German (formal)..."
deepl translate "$TEST_DIR/letter.txt" --to de --output "$TEST_DIR/letter-formal.de.txt" --formality more
echo
echo "Translating to German (informal)..."
deepl translate "$TEST_DIR/letter.txt" --to de --output "$TEST_DIR/letter-informal.de.txt" --formality less
echo
echo "✓ Translations complete!"
echo
echo "Formal version (greeting):"
head -n 3 "$TEST_DIR/letter-formal.de.txt"
echo
echo "Informal version (greeting):"
head -n 3 "$TEST_DIR/letter-informal.de.txt"
echo

# Example 4: Progress Tracking
echo "4. Document translation with progress tracking"
echo
echo "Creating a larger HTML document..."
cat > "$TEST_DIR/article.html" <<'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Machine Translation: Past, Present, and Future</title>
</head>
<body>
    <h1>Machine Translation: A Historical Perspective</h1>

    <h2>Early Beginnings</h2>
    <p>Machine translation has a rich history dating back to the 1950s. Early systems
    used rule-based approaches that required extensive linguistic knowledge and manual
    rule creation. These systems showed promise but struggled with the complexity and
    ambiguity of natural language.</p>

    <h2>Statistical Methods</h2>
    <p>In the 1990s, statistical machine translation emerged as a powerful alternative.
    These systems learned translation patterns from large bilingual text corpora,
    eliminating the need for hand-crafted rules. IBM's research in this area laid
    the foundation for many modern translation systems.</p>

    <h2>Neural Networks</h2>
    <p>The 2010s saw the rise of neural machine translation, using deep learning
    techniques to achieve unprecedented translation quality. These systems can capture
    context and nuance far better than their predecessors, leading to more natural
    and accurate translations.</p>

    <h2>The Future</h2>
    <p>Today's state-of-the-art systems, powered by transformer architectures and
    large language models, continue to push the boundaries of what's possible.
    The future promises even better quality, more languages, and specialized
    translation for different domains and contexts.</p>
</body>
</html>
EOF

echo "✓ Created article.html (larger document)"
echo
echo "Translating to Japanese (watch the progress tracking)..."
deepl translate "$TEST_DIR/article.html" --to ja --output "$TEST_DIR/article.ja.html"
echo
echo "✓ Translation complete with real-time progress updates!"
echo

echo "4b. Document minification for PPTX/DOCX:"
echo "   Use --enable-minification to reduce file size during translation:"
echo "   deepl translate presentation.pptx --to es --output presentation.es.pptx --enable-minification"
echo

# Example 5: Error Handling
echo "5. Error handling for unsupported formats"
echo
echo "Attempting to translate an unsupported file type..."
cat > "$TEST_DIR/data.json" <<'EOF'
{
  "message": "Hello, world!",
  "count": 42
}
EOF

if deepl translate "$TEST_DIR/data.json" --to es --output "$TEST_DIR/data.es.json" 2>&1 | grep -q "not supported\|unsupported"; then
  echo "✓ Correctly detected unsupported file format"
else
  echo "⚠ Note: JSON translation may have been attempted (check output)"
fi
echo

# Example 6: Document Translation Tips
echo "=== Document Translation Best Practices ==="
echo
echo "📋 Tips for optimal results:"
echo
echo "1. Format Preservation:"
echo "   • Use original file formats (e.g., .docx, not .doc)"
echo "   • Avoid complex custom formatting that may not translate well"
echo "   • Test with a small document first"
echo
echo "2. Large Documents:"
echo "   • PDFs: Up to 10MB"
echo "   • Other formats: Up to 30MB"
echo "   • Consider splitting very large documents"
echo
echo "3. Processing Time:"
echo "   • Document translation is asynchronous"
echo "   • Larger documents take longer (watch the progress updates)"
echo "   • The CLI automatically polls for completion"
echo
echo "4. Cost Tracking:"
echo "   • Document translations show billed characters"
echo "   • Use 'deepl usage' to monitor your quota"
echo
echo "5. Formality Options:"
echo "   • Use --formality for languages that support it (DE, FR, IT, ES, NL, PL, PT, RU, JA)"
echo "   • Options: default, more (formal), less (informal), prefer_more, prefer_less"
echo
echo "6. Quality Tips:"
echo "   • Use source language when known: --from en"
echo "   • Provide context if available: --context '...'"
echo "   • Use glossaries for consistent terminology"
echo

# Show file sizes and character counts
echo "=== Translation Summary ==="
echo
echo "Files created in $TEST_DIR:"
ls -lh "$TEST_DIR" | tail -n +2 | awk '{print $9, "(" $5 ")"}'
echo

# Example 7: Batch Document Translation
echo "7. Batch document translation"
echo
echo "Translating multiple documents to Spanish..."
for file in "$TEST_DIR/sample.html" "$TEST_DIR/readme.txt" "$TEST_DIR/letter.txt"; do
  filename=$(basename "$file")
  name="${filename%.*}"
  ext="${filename##*.}"
  output="$TEST_DIR/${name}.es.${ext}"

  if [ ! -f "$output" ]; then
    echo "  • Translating $filename..."
    deepl translate "$file" --to es --output "$output" > /dev/null 2>&1
  else
    echo "  • $filename already translated (skipping)"
  fi
done
echo
echo "✓ Batch translation complete!"
echo

# Check usage after all translations
echo "=== API Usage After Document Translation ==="
deepl usage
echo

# Cleanup
echo "Cleaning up temporary files..."
rm -rf "$TEST_DIR"
echo "✓ Cleanup complete"

echo
echo "=== All examples completed successfully! ==="
echo
echo "📚 What you learned:"
echo "  • Translating HTML, TXT, and other document formats"
echo "  • Using formality control for appropriate tone"
echo "  • Progress tracking for large documents"
echo "  • Error handling for unsupported formats"
echo "  • Best practices for document translation"
echo "  • Batch processing multiple documents"
echo
echo "🔗 Related examples:"
echo "  • examples/02-file-translation.sh - Basic file translation"
echo "  • examples/03-batch-processing.sh - Advanced batch processing"
echo "  • examples/15-glossaries.sh - Using glossaries with documents"
echo
echo "📖 For more information:"
echo "  deepl translate --help"
echo "  https://www.deepl.com/docs-api/documents"
