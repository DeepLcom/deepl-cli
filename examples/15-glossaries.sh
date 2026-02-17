#!/bin/bash
# Example 15: Glossaries (v3 API)
# Demonstrates managing glossaries for consistent terminology
# v3 API supports both single-target and multilingual glossaries

set -e  # Exit on error

echo "=== DeepL CLI Example 15: Glossaries (v3 API) ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Setup: Create sample glossary files in temp directory
SAMPLE_DIR="/tmp/deepl-example-15/sample-files"
rm -rf /tmp/deepl-example-15
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

# ═══════════════════════════════════════════════════════
# BASIC GLOSSARY OPERATIONS
# ═══════════════════════════════════════════════════════

# Example 1: Create a glossary
echo "1. Create tech glossary (EN → DE)"
deepl glossary create tech-terms-demo en de "$SAMPLE_DIR/tech-glossary.tsv"
echo

# Example 2: Create another glossary
echo "2. Create business glossary (EN → ES)"
deepl glossary create business-terms-demo en es "$SAMPLE_DIR/business-glossary.tsv"
echo

# Example 3: List all glossaries
echo "3. List all glossaries"
deepl glossary list
echo

echo "3b. List glossaries in JSON format:"
deepl glossary list --format json | head -5
echo

# Example 4: Show glossary details
echo "4. Show tech glossary details"
deepl glossary show tech-terms-demo
echo

echo "4b. Show glossary details in JSON format:"
deepl glossary show tech-terms-demo --format json
echo

# Example 5: View glossary entries
echo "5. View tech glossary entries"
deepl glossary entries tech-terms-demo
echo

# Example 6: View business glossary entries
echo "6. View business glossary entries"
deepl glossary entries business-terms-demo
echo

# Example 7: Rename a glossary
echo "7. Rename glossary"
deepl glossary rename tech-terms-demo tech-terms-renamed
echo "✓ Renamed tech-terms-demo to tech-terms-renamed"
echo "   (waiting for API propagation...)"
sleep 2
echo

# Example 8: Verify rename
echo "8. Verify rename"
deepl glossary show tech-terms-renamed
echo

# ═══════════════════════════════════════════════════════
# ENTRY MANAGEMENT
# ═══════════════════════════════════════════════════════

echo "9. Add entry to tech glossary:"
deepl glossary add-entry tech-terms-renamed "database" "Datenbank"
echo

echo "10. Verify new entry:"
deepl glossary entries tech-terms-renamed
echo

echo "11. Update an entry:"
deepl glossary update-entry tech-terms-renamed "request" "HTTP-Anfrage"
echo

echo "12. Remove an entry:"
deepl glossary remove-entry tech-terms-renamed "JSON"
echo

# ═══════════════════════════════════════════════════════
# MULTILINGUAL GLOSSARIES (v3 API)
# ═══════════════════════════════════════════════════════

cat > "$SAMPLE_DIR/multi-de.tsv" << 'EOF'
hello	Hallo
goodbye	Auf Wiedersehen
EOF

cat > "$SAMPLE_DIR/multi-fr.tsv" << 'EOF'
hello	Bonjour
goodbye	Au revoir
EOF

echo "13. Create multilingual glossary (EN → DE,FR):"
deepl glossary create multi-demo en de,fr "$SAMPLE_DIR/multi-de.tsv"
echo

echo "14. View German entries:"
deepl glossary entries multi-demo --target-lang de
echo

echo "15. View French entries:"
deepl glossary entries multi-demo --target-lang fr
echo

echo "16. Add entry to German dictionary:"
deepl glossary add-entry multi-demo "thank you" "Danke" --target-lang de
echo

echo "17. Replace French dictionary from file:"
deepl glossary replace-dictionary multi-demo fr "$SAMPLE_DIR/multi-fr.tsv"
echo

echo "18. Delete French dictionary:"
deepl glossary delete-dictionary multi-demo fr --yes
echo

# ═══════════════════════════════════════════════════════
# USING GLOSSARIES IN TRANSLATION
# ═══════════════════════════════════════════════════════

echo "19. Translate with glossary"
echo "   Without glossary:"
deepl translate "The API endpoint requires authentication." --from en --to de

echo
echo "   With tech glossary:"
deepl translate "The API endpoint requires authentication." --from en --to de --glossary tech-terms-renamed

echo

# ═══════════════════════════════════════════════════════
# ADVANCED OPERATIONS
# ═══════════════════════════════════════════════════════

echo "20. Combined update (rename + dictionary):"
deepl glossary update tech-terms-renamed --name tech-final --target-lang de --file "$SAMPLE_DIR/tech-glossary.tsv"
echo

echo "21. Dry-run delete:"
deepl glossary delete tech-final --dry-run
echo

echo "22. JSON output for scripting:"
deepl glossary show tech-final --format json
echo

# ═══════════════════════════════════════════════════════
# GLOSSARY LANGUAGE PAIRS
# ═══════════════════════════════════════════════════════

echo "23. List supported glossary language pairs"
deepl glossary languages | head -10
echo "   (showing first 10 pairs - see 'deepl glossary languages' for full list)"
echo

# ═══════════════════════════════════════════════════════
# CLEANUP
# ═══════════════════════════════════════════════════════

echo "24. Clean up - delete glossaries"
echo "   Deleting tech-final..."
deepl glossary delete tech-final --yes 2>/dev/null || echo "   (Already deleted)"

echo "   Deleting business-terms-demo..."
deepl glossary delete business-terms-demo --yes 2>/dev/null || echo "   (Already deleted)"

echo "   Deleting multi-demo..."
deepl glossary delete multi-demo --yes 2>/dev/null || echo "   (Already deleted)"

echo

# Verify deletion
echo "25. Verify glossaries are deleted"
deepl glossary list
echo

# Cleanup temporary files
echo "Cleaning up temporary files..."
rm -rf /tmp/deepl-example-15
echo "✓ Cleanup complete"

echo "=== All glossary examples completed! ==="
echo
echo "💡 Glossary Tips:"
echo "   ✓ Glossaries ensure consistent translation of technical terms"
echo "   ✓ v3 API supports multilingual glossaries (multiple target languages)"
echo "   ✓ Use glossaries for:"
echo "     - Product names (e.g., 'iPhone' should not be translated)"
echo "     - Technical terminology (e.g., 'API', 'endpoint', 'authentication')"
echo "     - Brand-specific terms (e.g., company name, product features)"
echo "     - Domain-specific vocabulary (e.g., legal, medical, financial terms)"
echo
echo "   ✓ For multilingual glossaries, use --target-lang flag to specify"
echo "     which language pair to view/modify:"
echo "     deepl glossary entries my-glossary --target-lang de"
echo "     deepl glossary add-entry my-glossary 'source' 'target' --target-lang de"
