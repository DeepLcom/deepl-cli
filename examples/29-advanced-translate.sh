#!/bin/bash
# Example 29: Advanced Translation Options
# Demonstrates tag handling versions, beta languages, custom API URLs, and minification

set -e  # Exit on error

echo "=== DeepL CLI Example 29: Advanced Translation Options ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Setup: Create temp directory for test files
TEMP_DIR="/tmp/deepl-example-29"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Example 1: Tag handling version v2
echo "=== 1. Tag Handling Version ==="
echo

cat > "$TEMP_DIR/structured.html" <<'EOF'
<div class="article">
  <h1>Product Launch</h1>
  <p>We are excited to announce our <strong>new product line</strong>.</p>
  <ul>
    <li>Feature one: improved performance</li>
    <li>Feature two: better reliability</li>
  </ul>
</div>
EOF

echo "Translating HTML with --tag-handling html --tag-handling-version v2:"
echo
deepl translate "$TEMP_DIR/structured.html" --to de --tag-handling html --tag-handling-version v2 --output "$TEMP_DIR/structured.de.html"
echo
echo "✓ Translation with v2 tag handling complete"
echo
echo "Tag handling versions:"
echo "  --tag-handling-version v1   Original tag handling (default)"
echo "  --tag-handling-version v2   Improved structure handling"
echo "  (requires --tag-handling xml or --tag-handling html)"
echo

# Example 2: Beta languages
echo "=== 2. Beta Languages ==="
echo

echo "Include beta languages that are not yet stable:"
echo "  deepl translate 'Hello world' --to ar --enable-beta-languages"
echo
echo "Beta languages may have lower quality but provide forward-compatibility"
echo "as DeepL adds support for new languages."
echo
echo "List available languages (including beta):"
echo "  deepl languages --source"
echo "  deepl languages --target"
echo

# Example 3: Custom API URL
echo "=== 3. Custom API Endpoint ==="
echo

echo "Override the API endpoint for specific use cases:"
echo
echo "  # Use the free API explicitly"
echo "  deepl translate 'Hello' --to es --api-url https://api-free.deepl.com/v2"
echo
echo "  # Use the Pro API"
echo "  deepl translate 'Hello' --to es --api-url https://api.deepl.com/v2"
echo
echo "  # Use an internal proxy or test server"
echo "  deepl translate 'Hello' --to es --api-url https://deepl-proxy.internal.example.com/v2"
echo
echo "This is useful for:"
echo "  - Switching between Free and Pro APIs per command"
echo "  - Routing through a corporate proxy"
echo "  - Testing against staging environments"
echo

# Example 4: Document minification
echo "=== 4. Document Minification ==="
echo

echo "Enable minification for PPTX and DOCX documents:"
echo "  deepl translate presentation.pptx --to es --enable-minification --output presentation.es.pptx"
echo "  deepl translate report.docx --to de --enable-minification --output report.de.docx"
echo
echo "Minification reduces the file size of translated documents by optimizing"
echo "internal structure. Only supported for PPTX and DOCX formats."
echo

# Example 5: Combining advanced options
echo "=== 5. Combining Advanced Options ==="
echo

cat > "$TEMP_DIR/complex.html" <<'EOF'
<article>
  <h1>Technical Documentation</h1>
  <p>This guide covers the <code>configure()</code> API.</p>
  <p>For best results, use the <em>recommended settings</em>.</p>
</article>
EOF

echo "Combining multiple advanced flags:"
echo "  deepl translate complex.html --to de \\"
echo "    --tag-handling html --tag-handling-version v2 \\"
echo "    --formality more --preserve-code \\"
echo "    --enable-beta-languages"
echo
deepl translate "$TEMP_DIR/complex.html" --to de --tag-handling html --tag-handling-version v2 --formality more --preserve-code --output "$TEMP_DIR/complex.de.html"
echo
echo "✓ Combined advanced translation complete"
echo

# Summary
echo "=== Advanced Options Summary ==="
echo
echo "Tag handling:"
echo "  --tag-handling <xml|html>          Enable tag handling mode"
echo "  --tag-handling-version <v1|v2>     Tag handling version (v2 = improved)"
echo
echo "Beta languages:"
echo "  --enable-beta-languages            Include unstable/beta languages"
echo
echo "API endpoint:"
echo "  --api-url <url>                    Custom API endpoint URL"
echo
echo "Document options:"
echo "  --enable-minification              Reduce PPTX/DOCX file size"
echo "  --output-format docx              Convert PDF to DOCX"
echo

echo "=== All examples completed successfully! ==="
