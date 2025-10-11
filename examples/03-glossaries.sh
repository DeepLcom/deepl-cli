#!/bin/bash
# Example 3: Glossaries
# Demonstrates managing glossaries for consistent terminology

set -e  # Exit on error

echo "=== DeepL CLI Example 3: Glossaries ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Setup: Create sample glossary files
SAMPLE_DIR="examples/sample-files"
mkdir -p "$SAMPLE_DIR"

# Create a tech terminology glossary (EN → DE)
cat > "$SAMPLE_DIR/tech-glossary.tsv" << 'EOF'
API	API
REST	REST
authentication	Authentifizierung
authorization	Autorisierung
endpoint	Endpunkt
JSON	JSON
request	Anfrage
response	Antwort
EOF

# Create a business terminology glossary (EN → ES)
cat > "$SAMPLE_DIR/business-glossary.tsv" << 'EOF'
stakeholder	parte interesada
deliverable	entregable
milestone	hito
budget	presupuesto
timeline	cronograma
EOF

echo "✓ Sample glossary files created"
echo

# Example 1: Create a glossary
echo "1. Create tech glossary (EN → DE)"
deepl glossary create tech-terms en de "$SAMPLE_DIR/tech-glossary.tsv"
echo

# Example 2: Create another glossary
echo "2. Create business glossary (EN → ES)"
deepl glossary create business-terms en es "$SAMPLE_DIR/business-glossary.tsv"
echo

# Example 3: List all glossaries
echo "3. List all glossaries"
deepl glossary list
echo

# Example 4: Show glossary details
echo "4. Show tech glossary details"
deepl glossary show tech-terms
echo

# Example 5: View glossary entries
echo "5. View tech glossary entries"
deepl glossary entries tech-terms
echo

# Example 6: View business glossary entries
echo "6. View business glossary entries"
deepl glossary entries business-terms
echo

# Example 7: Find glossary by ID (get ID from list)
echo "7. Find glossary by ID"
GLOSSARY_ID=$(deepl glossary list 2>/dev/null | grep -A 1 "tech-terms" | grep "ID:" | awk '{print $2}' | head -1)
if [ -n "$GLOSSARY_ID" ]; then
  echo "   Looking up glossary with ID: $GLOSSARY_ID"
  deepl glossary show "$GLOSSARY_ID"
fi
echo

# Cleanup: Delete glossaries
echo "8. Clean up - delete glossaries"
echo "   Deleting tech-terms..."
deepl glossary delete tech-terms 2>/dev/null || echo "   (Already deleted)"

echo "   Deleting business-terms..."
deepl glossary delete business-terms 2>/dev/null || echo "   (Already deleted)"

echo

# Verify deletion
echo "9. Verify glossaries are deleted"
deepl glossary list
echo

echo "=== All glossary examples completed! ==="
echo
echo "💡 Tip: Glossaries ensure consistent translation of technical terms across your project."
echo "   Use them for:"
echo "   - Product names"
echo "   - Technical terminology"
echo "   - Brand-specific terms"
echo "   - Domain-specific vocabulary"
