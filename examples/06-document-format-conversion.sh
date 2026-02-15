#!/bin/bash
# Example 6: Document Format Conversion
# Demonstrates the --output-format flag for document translation

set -e  # Exit on error

echo "=== DeepL CLI Example 6: Document Format Conversion ==="
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
TEST_DIR="/tmp/deepl-example-06"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"

echo "=== Understanding Document Format Conversion ==="
echo
echo "⚠️  IMPORTANT: DeepL API Format Conversion Limitations"
echo
echo "The --output-format flag is available, but DeepL API currently"
echo "supports ONLY ONE format conversion:"
echo
echo "  ✅ PDF → DOCX  (Convert PDF to Microsoft Word)"
echo
echo "All other format combinations are NOT supported:"
echo "  ❌ HTML → TXT   (not supported)"
echo "  ❌ DOCX → PDF   (not supported)"
echo "  ❌ PPTX → DOCX  (not supported)"
echo "  ❌ Any other conversion (not supported)"
echo
echo "By default, translated documents are returned in the same"
echo "format as the input document."
echo
echo "Source: https://developers.deepl.com/api-reference/document"
echo

# Example 1: PDF → DOCX (The ONLY supported conversion)
echo "=== Supported Conversion: PDF → DOCX ==="
echo
echo "To demonstrate PDF → DOCX conversion, you would need a PDF file."
echo
echo "Example command (if you have a PDF):"
echo "  deepl translate document.pdf --to es --output-format docx --output document.es.docx"
echo
echo "This would:"
echo "  1. Translate the PDF content to Spanish"
echo "  2. Convert the result to Microsoft Word format (DOCX)"
echo "  3. Save as document.es.docx"
echo
echo "Why use PDF → DOCX conversion?"
echo "  • Edit translated PDFs in Microsoft Word"
echo "  • Make corrections or adjustments to translation"
echo "  • Reformat translated content"
echo "  • Extract text from PDF for further processing"
echo

# Example 2: Default behavior (same format as input)
echo "=== Default Behavior: Same Format as Input ==="
echo
echo "Creating a sample HTML document..."
cat > "$TEST_DIR/sample.html" <<'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Sample Document</title>
</head>
<body>
    <h1>Welcome to DeepL Translation</h1>
    <p>This is a sample HTML document for translation.</p>
    <p>DeepL provides high-quality translation services.</p>
</body>
</html>
EOF

echo "✓ Created sample.html"
echo
echo "Translating HTML document to Spanish (same format)..."
deepl translate "$TEST_DIR/sample.html" --to es --output "$TEST_DIR/sample.es.html"
echo
echo "✓ Translation complete!"
echo
echo "Result: HTML input → HTML output (default behavior)"
echo
echo "Translated HTML (first 10 lines):"
head -n 10 "$TEST_DIR/sample.es.html"
echo

# Example 3: Attempting unsupported conversion (will fail)
echo "=== What Happens with Unsupported Conversions ==="
echo
echo "Attempting HTML → TXT conversion (unsupported)..."
echo
echo "Command: deepl translate sample.html --to es --output-format txt --output sample.txt"
echo
echo "Expected result: ❌ Error - Conversion not supported"
echo
echo "If you try this, you'll see:"
echo '  Error: API error: Conversion between different document types is not supported'
echo

# Example 4: Working with different document types
echo "=== Supported Document Types (Without Conversion) ==="
echo
echo "These document types CAN be translated (output = same format):"
echo
echo "  ✅ PDF    - Returns translated PDF"
echo "  ✅ DOCX   - Returns translated DOCX"
echo "  ✅ PPTX   - Returns translated PPTX"
echo "  ✅ XLSX   - Returns translated XLSX"
echo "  ✅ HTML   - Returns translated HTML"
echo "  ✅ TXT    - Returns translated TXT"
echo "  ✅ SRT    - Returns translated SRT (subtitles)"
echo "  ✅ XLIFF  - Returns translated XLIFF (localization)"
echo

# Example 5: Practical workflows
echo "=== Practical Translation Workflows ==="
echo
echo "Since format conversion is limited, use these workflows:"
echo
echo "1. PDF → Editable Word:"
echo "   deepl translate report.pdf --to de --output-format docx --output report.de.docx"
echo "   → Translate PDF and convert to Word for editing"
echo
echo "2. Translate and Keep Format:"
echo "   deepl translate document.docx --to es --output document.es.docx"
echo "   → DOCX stays DOCX (no conversion needed)"
echo
echo "3. HTML Content Translation:"
echo "   deepl translate webpage.html --to fr --output webpage.fr.html"
echo "   → HTML stays HTML (preserves structure)"
echo
echo "4. Batch Processing (same format):"
echo "   for lang in es fr de; do"
echo '     deepl translate doc.html --to $lang --output doc.$lang.html'
echo "   done"
echo "   → Translate to multiple languages, same format"
echo
echo "5. External Format Conversion:"
echo "   # If you need other conversions, use external tools:"
echo "   deepl translate doc.html --to es --output doc.es.html"
echo "   pandoc doc.es.html -o doc.es.txt  # HTML → TXT"
echo "   → Translate first, convert format separately"
echo

# Example 6: Alternative approaches
echo "=== Alternative Approaches for Format Conversion ==="
echo
echo "If you need format conversions beyond PDF → DOCX:"
echo
echo "Option 1: Text-based translation + pandoc"
echo "  # For text content, use pandoc for conversions"
echo "  pandoc input.docx -o input.txt"
echo "  deepl translate input.txt --to es --output output.es.txt"
echo "  pandoc output.es.txt -o output.es.pdf"
echo
echo "Option 2: Use text translation API"
echo "  # For simple text, extract and translate text directly"
echo '  text=$(cat document.txt)'
echo '  deepl translate "$text" --to es > translated.txt'
echo
echo "Option 3: External conversion tools"
echo "  # Use tools like LibreOffice, pandoc, wkhtmltopdf"
echo "  deepl translate doc.html --to es --output doc.es.html"
echo "  wkhtmltopdf doc.es.html doc.es.pdf"
echo

# Show created files
echo "=== Files Created in This Example ==="
echo
ls -lh "$TEST_DIR" | tail -n +2 | awk '{print "  " $9, "(" $5 ")"}'
echo

# Summary
echo "=== Summary: Document Format Conversion ==="
echo
echo "Key Takeaways:"
echo
echo "✅ What IS supported:"
echo "   • PDF → DOCX conversion with --output-format docx"
echo "   • All document types can be translated (output = same format)"
echo
echo "❌ What is NOT supported:"
echo "   • Any other format conversion (HTML→TXT, DOCX→PDF, etc.)"
echo "   • Multi-format output from single translation"
echo
echo "💡 Best Practices:"
echo "   • Use --output-format docx only for PDF inputs"
echo "   • For other conversions, use external tools (pandoc, LibreOffice)"
echo "   • Default behavior (same format) works for most use cases"
echo "   • Check DeepL API docs for updates on supported conversions"
echo
echo "🔗 References:"
echo "   • DeepL API Docs: https://developers.deepl.com/api-reference/document"
echo "   • Format Conversion Matrix: See official documentation"
echo

# Cleanup
echo "Cleaning up temporary files..."
rm -rf "$TEST_DIR"
echo "✓ Cleanup complete"

echo
echo "=== All examples completed successfully! ==="
echo
echo "📚 What you learned:"
echo "  • DeepL API only supports PDF → DOCX conversion"
echo "  • All other document types keep their original format"
echo "  • How to use --output-format for PDF → DOCX"
echo "  • Alternative approaches for other format conversions"
echo
echo "🔗 Related examples:"
echo "  • examples/05-document-translation.sh - Basic document translation"
echo "  • examples/02-file-translation.sh - File translation basics"
echo
