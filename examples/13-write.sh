#!/bin/bash
# Example 13: DeepL Write API
# Demonstrates grammar, style, and tone enhancement

set -e  # Exit on error

echo "=== DeepL CLI Example 13: DeepL Write API ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Basic text improvement
echo "1. Basic text improvement:"
deepl write "This is a sentence." --lang en-US
echo

# Business writing style
echo "2. Business writing style:"
deepl write "We want to tell you about our new product." --lang en-US --style business
echo

# Academic writing style
echo "3. Academic writing style:"
deepl write "This shows that the method works." --lang en-US --style academic
echo

# Casual writing style
echo "4. Casual writing style:"
deepl write "That is interesting." --lang en-US --style casual
echo

# Simple writing style
echo "5. Simple writing style:"
deepl write "The implementation demonstrates efficacy." --lang en-US --style simple
echo

# Enthusiastic tone
echo "6. Enthusiastic tone:"
deepl write "This is good." --lang en-US --tone enthusiastic
echo

# Friendly tone
echo "7. Friendly tone:"
deepl write "Hello." --lang en-US --tone friendly
echo

# Confident tone
echo "8. Confident tone:"
deepl write "I think this will work." --lang en-US --tone confident
echo

# Diplomatic tone
echo "9. Diplomatic tone:"
deepl write "Try something else." --lang en-US --tone diplomatic
echo

# Show alternatives
echo "10. Show all alternative improvements:"
deepl write "This is a test." --lang en-US --alternatives
echo

# Different languages
echo "11. German text improvement:"
deepl write "Das ist ein Satz." --lang de
echo

echo "12. Spanish text improvement:"
deepl write "Esta es una oración." --lang es
echo

echo "13. French text improvement:"
deepl write "Ceci est une phrase." --lang fr
echo

# Prefer styles (fallback if not supported)
echo "14. Prefer business style (with fallback):"
deepl write "We need to discuss this." --lang en-US --style prefer_business
echo

echo "15. Bypass cache (always call API):"
deepl write "This is a sentence." --lang en-US --no-cache
echo

# ═══════════════════════════════════════════════════════
# FILE OPERATIONS
# ═══════════════════════════════════════════════════════

DEMO_FILE="/tmp/deepl-write-demo.txt"
echo "Their going to the store tommorow. The weather will be good, I think we should definately go." > "$DEMO_FILE"

echo "16. Improve text from a file:"
deepl write "$DEMO_FILE" --lang en-US
echo

echo "17. Write improved text to output file:"
deepl write "$DEMO_FILE" --output /tmp/deepl-write-improved.txt --lang en-US
echo "   Output saved to /tmp/deepl-write-improved.txt"
cat /tmp/deepl-write-improved.txt
echo

# ═══════════════════════════════════════════════════════
# CHECK & FIX OPERATIONS
# ═══════════════════════════════════════════════════════

echo "18. Check if text needs improvement (exit 0=clean, 8=changes needed):"
deepl write "Their going to the store" --check --lang en-US || true
echo

echo "19. Check a file for improvements:"
deepl write "$DEMO_FILE" --check --lang en-US || true
echo

echo "20. Auto-fix a file in place:"
echo "Their going to the store tommorow." > "$DEMO_FILE"
deepl write "$DEMO_FILE" --fix
echo "   Fixed content:"
cat "$DEMO_FILE"
echo

echo "21. Auto-fix with backup:"
echo "Their going to the store tommorow." > "$DEMO_FILE"
deepl write "$DEMO_FILE" --fix --backup
echo "   Backup created at: ${DEMO_FILE}.bak"
echo

# ═══════════════════════════════════════════════════════
# DIFF & IN-PLACE
# ═══════════════════════════════════════════════════════

echo "22. Show diff between original and improved text:"
deepl write "Their going to the store tommorow." --diff --lang en-US
echo

echo "23. Edit file in place:"
echo "This text could be more better." > "$DEMO_FILE"
deepl write "$DEMO_FILE" --in-place --lang en-US
echo "   Updated file content:"
cat "$DEMO_FILE"
echo

# ═══════════════════════════════════════════════════════
# OUTPUT FORMATS
# ═══════════════════════════════════════════════════════

echo "24. JSON output format:"
deepl write "Their going to the store" --format json --lang en-US
echo

# ═══════════════════════════════════════════════════════
# INTERACTIVE MODE
# ═══════════════════════════════════════════════════════

# Note: --interactive requires a TTY (won't work in piped scripts)
echo "25. Interactive mode (choose from multiple suggestions):"
echo "   deepl write \"Their going to the store\" --interactive --lang en-US"
echo "   (Skipped in non-interactive script — try this manually)"
echo

# Cleanup
rm -f "$DEMO_FILE" "${DEMO_FILE}.bak" /tmp/deepl-write-improved.txt

echo "=== All examples completed successfully! ==="
