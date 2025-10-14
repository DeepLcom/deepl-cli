#!/bin/bash
# Example 19: Advanced XML Tag Handling
# Demonstrates fine-tuned control over XML/HTML translation with tag handling parameters

set -e  # Exit on error

echo "=== DeepL CLI Example 19: Advanced XML Tag Handling ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Create temporary directory for example files
TEMP_DIR="/tmp/deepl-example-19"
mkdir -p "$TEMP_DIR"

echo "1. Basic XML tag preservation (default behavior)"
echo "   Input: <p>Hello world</p>"
deepl translate "<p>Hello world</p>" --to es --tag-handling xml
echo

echo "2. Disable automatic XML structure detection"
echo "   Useful when you want manual control over tag handling"
echo "   Input: <doc><section>Welcome to our platform</section></doc>"
deepl translate "<doc><section>Welcome to our platform</section></doc>" --to es --tag-handling xml --outline-detection false
echo

echo "3. Specify tags that split sentences"
echo "   Tags like <br/> and <hr/> act as sentence boundaries"
echo "   Input: <div>First sentence<br/>Second sentence<hr/>Third sentence</div>"
deepl translate "<div>First sentence<br/>Second sentence<hr/>Third sentence</div>" --to es --tag-handling xml --splitting-tags "br,hr"
echo

echo "4. Specify non-splitting tags (preserve content structure)"
echo "   Code blocks and preformatted text shouldn't be split"
echo "   Input: <doc><code>let x = 1; let y = 2;</code><p>This is a paragraph.</p></doc>"
deepl translate "<doc><code>let x = 1; let y = 2;</code><p>This is a paragraph.</p></doc>" --to es --tag-handling xml --non-splitting-tags "code,pre"
echo

echo "5. Ignore specific tags and their content"
echo "   Scripts, styles, and other non-translatable content"
# Create a test HTML file
cat > "$TEMP_DIR/page.html" << 'EOF'
<html>
<head>
  <style>body { color: blue; }</style>
  <script>console.log("Hello");</script>
</head>
<body>
  <h1>Welcome to our website</h1>
  <p>This content will be translated.</p>
  <noscript>Please enable JavaScript.</noscript>
</body>
</html>
EOF

echo "   Translating HTML file while ignoring <script>, <style>, and <noscript> tags..."
deepl translate "$TEMP_DIR/page.html" --to es --tag-handling xml --ignore-tags "script,style,noscript" --output "$TEMP_DIR/page.es.html"
echo "   ✓ Translated to: $TEMP_DIR/page.es.html"
echo "   (Scripts and styles remain untranslated)"
echo

echo "6. Combine multiple XML tag handling options"
echo "   Fine-tuned control for complex XML documents"
# Create a complex XML document
cat > "$TEMP_DIR/article.xml" << 'EOF'
<article>
  <metadata>
    <author>John Doe</author>
    <date>2024-10-14</date>
  </metadata>
  <content>
    <section>
      <h1>Technical Documentation</h1>
      <p>This is the introduction.</p>
      <code>function example() { return true; }</code>
      <p>More content here.<br/>Next line after break.</p>
    </section>
    <script>trackPageView();</script>
  </content>
</article>
EOF

echo "   Using all XML tag handling options together:"
deepl translate "$TEMP_DIR/article.xml" --to de --tag-handling xml \
  --outline-detection false \
  --splitting-tags "br,hr,section" \
  --non-splitting-tags "code,pre,kbd,metadata" \
  --ignore-tags "script,style" \
  --output "$TEMP_DIR/article.de.xml"

echo "   ✓ Translated complex XML with custom tag handling"
echo "   Output: $TEMP_DIR/article.de.xml"
echo

echo "7. Real-world example: Translate technical documentation HTML"
# Create a technical doc example
cat > "$TEMP_DIR/docs.html" << 'EOF'
<html>
<head>
  <title>API Documentation</title>
  <style>.highlight { background: yellow; }</style>
</head>
<body>
  <h1>REST API Reference</h1>
  <p>Welcome to our API documentation.</p>

  <h2>Authentication</h2>
  <p>Use the following code to authenticate:</p>
  <pre>
const apiKey = "your-api-key";
fetch("/api/endpoint", {
  headers: { "Authorization": `Bearer ${apiKey}` }
});
  </pre>

  <p>For more information, visit our website.</p>

  <script>
  // Analytics code
  ga('send', 'pageview');
  </script>
</body>
</html>
EOF

echo "   Translating technical documentation with code preservation:"
deepl translate "$TEMP_DIR/docs.html" --to fr --tag-handling xml \
  --non-splitting-tags "pre,code" \
  --ignore-tags "script,style" \
  --output "$TEMP_DIR/docs.fr.html"

echo "   ✓ Translated technical docs to French"
echo "   - Code blocks preserved (not split into sentences)"
echo "   - Scripts and styles ignored (not translated)"
echo "   - Output: $TEMP_DIR/docs.fr.html"
echo

echo "8. Use case: Localize XML configuration files"
# Create a config file with translatable and non-translatable content
cat > "$TEMP_DIR/config.xml" << 'EOF'
<config>
  <app>
    <name>MyApplication</name>
    <welcome-message>Welcome to our application</welcome-message>
    <help-text>Click here for help</help-text>
  </app>
  <system>
    <version>1.0.0</version>
    <api-endpoint>https://api.example.com</api-endpoint>
  </system>
</config>
EOF

echo "   Translating app messages while preserving system config:"
deepl translate "$TEMP_DIR/config.xml" --to ja --tag-handling xml \
  --non-splitting-tags "system,version,api-endpoint" \
  --output "$TEMP_DIR/config.ja.xml"

echo "   ✓ Translated config file to Japanese"
echo "   - User-facing messages translated"
echo "   - System configuration preserved"
echo "   Output: $TEMP_DIR/config.ja.xml"
echo

echo "Tip: XML tag handling parameters are powerful for:"
echo "  • Localizing HTML websites"
echo "  • Translating technical documentation"
echo "  • Processing custom XML formats"
echo "  • Preserving code blocks and special content"
echo "  • Fine-tuned control over sentence splitting"
echo

echo "Note: All XML tag handling flags require --tag-handling xml"
echo

# Show output directory contents
echo "All example files saved to: $TEMP_DIR/"
ls -lh "$TEMP_DIR/" | tail -n +2

echo
echo "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"
echo "✓ Cleanup complete"

echo
echo "=== All examples completed successfully! ==="
