#!/bin/bash
# Example 16: Document Format Conversion
# Demonstrates translating documents while converting to different formats

set -e  # Exit on error

echo "=== DeepL CLI Example 16: Document Format Conversion ==="
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
TEST_DIR="/tmp/deepl-example-16"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"

echo "=== Document Format Conversion Examples ==="
echo
echo "The --output-format flag allows you to convert document formats"
echo "during translation, combining two operations into one:"
echo "  1. Translate the document content"
echo "  2. Convert to the target format"
echo
echo "This is especially useful for:"
echo "  • Creating PDF versions of Word documents"
echo "  • Extracting text content from HTML/PDF"
echo "  • Converting presentations to Word format"
echo
echo "Supported output formats:"
echo "  pdf, docx, pptx, xlsx, html, htm, txt, srt, xlf, xliff"
echo

# Example 1: HTML to Plain Text
echo "1. Converting HTML document to plain text during translation"
echo
echo "Creating a sample HTML document..."
cat > "$TEST_DIR/webpage.html" <<'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>DeepL Translation Service</title>
</head>
<body>
    <h1>Welcome to DeepL Translation</h1>
    <p>DeepL provides high-quality neural machine translation in over 30 languages.</p>
    <h2>Key Features</h2>
    <ul>
        <li>Neural network-based translation</li>
        <li>Context-aware processing</li>
        <li>Support for multiple document formats</li>
        <li>Glossary management</li>
    </ul>
    <p>Try DeepL today for professional-grade translations.</p>
</body>
</html>
EOF

echo "✓ Created webpage.html"
echo
echo "Translating to Spanish and converting to plain text..."
deepl translate "$TEST_DIR/webpage.html" --to es --output-format txt --output "$TEST_DIR/webpage.es.txt"
echo
echo "✓ Translation and conversion complete!"
echo
echo "Original HTML (first 10 lines):"
head -n 10 "$TEST_DIR/webpage.html"
echo
echo "Translated plain text output:"
cat "$TEST_DIR/webpage.es.txt"
echo

# Example 2: DOCX to PDF (simulated with HTML → TXT)
echo "2. Converting document format during translation (HTML → TXT as example)"
echo
echo "Creating a sample report..."
cat > "$TEST_DIR/report.html" <<'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Quarterly Report</title>
</head>
<body>
    <h1>Q4 2024 Sales Report</h1>
    <h2>Executive Summary</h2>
    <p>Our sales performance in Q4 2024 exceeded expectations, with a 15% increase over Q3.</p>
    <h2>Key Metrics</h2>
    <p>Total Revenue: $1.2M</p>
    <p>New Customers: 450</p>
    <p>Customer Retention: 92%</p>
    <h2>Outlook</h2>
    <p>We expect continued growth in Q1 2025 based on our strong pipeline.</p>
</body>
</html>
EOF

echo "✓ Created report.html"
echo
echo "Translating to German and converting to plain text..."
deepl translate "$TEST_DIR/report.html" --to de --output-format txt --output "$TEST_DIR/report.de.txt"
echo
echo "✓ Conversion complete!"
echo
echo "Translated and converted report (plain text):"
cat "$TEST_DIR/report.de.txt"
echo

# Example 3: Multiple Format Conversions
echo "3. Converting the same source to multiple formats"
echo
echo "Creating a technical document..."
cat > "$TEST_DIR/technical.html" <<'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>API Documentation</title>
</head>
<body>
    <h1>REST API Reference</h1>
    <h2>Authentication</h2>
    <p>All API requests require authentication using an API key.</p>
    <p>Include your key in the Authorization header:</p>
    <p>Authorization: DeepL-Auth-Key YOUR_API_KEY</p>
    <h2>Endpoints</h2>
    <p>/v2/translate - Translate text</p>
    <p>/v2/document - Translate documents</p>
    <p>/v2/usage - Check API usage</p>
</body>
</html>
EOF

echo "✓ Created technical.html"
echo
echo "Translating to French (keeping as HTML)..."
deepl translate "$TEST_DIR/technical.html" --to fr --output "$TEST_DIR/technical.fr.html"
echo
echo "Translating to French (converting to plain text)..."
deepl translate "$TEST_DIR/technical.html" --to fr --output-format txt --output "$TEST_DIR/technical.fr.txt"
echo
echo "✓ Multiple format outputs created!"
echo
echo "HTML version (first 15 lines):"
head -n 15 "$TEST_DIR/technical.fr.html"
echo
echo "Plain text version:"
cat "$TEST_DIR/technical.fr.txt"
echo

# Example 4: Format Conversion with Formality
echo "4. Combining format conversion with formality control"
echo
echo "Creating a business letter..."
cat > "$TEST_DIR/letter.html" <<'EOF'
<!DOCTYPE html>
<html>
<body>
    <p>Dear Customer,</p>
    <p>Thank you for your interest in our services.</p>
    <p>We would be happy to provide you with a detailed quotation.</p>
    <p>Please contact us if you have any questions.</p>
    <p>Best regards,<br/>Customer Service Team</p>
</body>
</html>
EOF

echo "✓ Created letter.html"
echo
echo "Translating to German (formal) and converting to plain text..."
deepl translate "$TEST_DIR/letter.html" --to de --formality more --output-format txt --output "$TEST_DIR/letter.formal.de.txt"
echo
echo "✓ Formal translation with format conversion complete!"
echo
echo "Formal German letter (plain text):"
cat "$TEST_DIR/letter.formal.de.txt"
echo

# Example 5: Use Cases for Format Conversion
echo "=== Common Use Cases for Format Conversion ==="
echo
echo "📋 Practical applications:"
echo
echo "1. Web Content Extraction:"
echo "   deepl translate webpage.html --to es --output-format txt --output content.es.txt"
echo "   → Extract and translate HTML content to clean text"
echo
echo "2. Document Archival (simulated):"
echo "   deepl translate document.docx --to fr --output-format pdf --output document.fr.pdf"
echo "   → Create PDF archives of translated Word documents"
echo "   (Note: Real DOCX → PDF requires actual DOCX file)"
echo
echo "3. Presentation Conversion (simulated):"
echo "   deepl translate slides.pptx --to de --output-format docx --output slides.de.docx"
echo "   → Convert PowerPoint to Word for easier editing"
echo "   (Note: Real PPTX → DOCX requires actual PPTX file)"
echo
echo "4. Multi-Format Distribution:"
echo "   # Create both formats from same source"
echo "   deepl translate doc.html --to ja --output doc.ja.html"
echo "   deepl translate doc.html --to ja --output-format txt --output doc.ja.txt"
echo "   → Provide content in multiple formats"
echo
echo "5. Localization Workflows:"
echo "   deepl translate strings.xlf --to es,fr,de --output-format xliff --output translations/"
echo "   → Translate localization files with format conversion"
echo

# Example 6: Format Conversion Tips
echo "=== Format Conversion Best Practices ==="
echo
echo "💡 Tips for optimal results:"
echo
echo "1. Format Compatibility:"
echo "   • Not all conversions are supported (check DeepL API docs)"
echo "   • Text-based formats work best (HTML → TXT, etc.)"
echo "   • Complex formatting may be simplified"
echo
echo "2. Quality Considerations:"
echo "   • HTML → TXT: Preserves content, removes markup"
echo "   • PDF conversions: Best with text-based PDFs"
echo "   • DOCX → PDF: Maintains most formatting"
echo
echo "3. When to Use Format Conversion:"
echo "   ✓ Extracting text from markup (HTML → TXT)"
echo "   ✓ Creating archives (DOCX → PDF)"
echo "   ✓ Simplifying for editing (PPTX → DOCX)"
echo "   ✗ Not for format migration without translation"
echo "   ✗ Not for complex layout preservation"
echo
echo "4. Workflow Integration:"
echo "   • Combine with --formality for business documents"
echo "   • Use with --context for better translation quality"
echo "   • Batch process multiple files with same conversion"
echo
echo "5. Testing Recommendations:"
echo "   • Test with sample documents first"
echo "   • Verify formatting in output files"
echo "   • Check character counts with 'deepl usage'"
echo

# Show created files
echo "=== Translation Summary ==="
echo
echo "Files created in $TEST_DIR:"
ls -lh "$TEST_DIR" | tail -n +2 | awk '{print $9, "(" $5 ")"}'
echo

# Check usage after all translations
echo "=== API Usage After Format Conversions ==="
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
echo "  • Converting HTML to plain text during translation"
echo "  • Creating multiple output formats from same source"
echo "  • Combining format conversion with formality control"
echo "  • Common use cases for format conversion"
echo "  • Best practices and tips"
echo
echo "🔗 Related examples:"
echo "  • examples/15-document-translation.sh - Basic document translation"
echo "  • examples/02-file-translation.sh - File translation basics"
echo "  • examples/07-batch-processing.sh - Batch file processing"
echo
echo "📖 For more information:"
echo "  deepl translate --help"
echo "  https://www.deepl.com/docs-api/documents"
echo
