#!/bin/bash
# Example 9: DeepL Write API
# Demonstrates grammar, style, and tone enhancement

set -e  # Exit on error

echo "=== DeepL CLI Example 9: DeepL Write API ==="
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
deepl write "This is a sentence." --to en-US
echo

# Business writing style
echo "2. Business writing style:"
deepl write "We want to tell you about our new product." --to en-US --style business
echo

# Academic writing style
echo "3. Academic writing style:"
deepl write "This shows that the method works." --to en-US --style academic
echo

# Casual writing style
echo "4. Casual writing style:"
deepl write "That is interesting." --to en-US --style casual
echo

# Simple writing style
echo "5. Simple writing style:"
deepl write "The implementation demonstrates efficacy." --to en-US --style simple
echo

# Enthusiastic tone
echo "6. Enthusiastic tone:"
deepl write "This is good." --to en-US --tone enthusiastic
echo

# Friendly tone
echo "7. Friendly tone:"
deepl write "Hello." --to en-US --tone friendly
echo

# Confident tone
echo "8. Confident tone:"
deepl write "I think this will work." --to en-US --tone confident
echo

# Diplomatic tone
echo "9. Diplomatic tone:"
deepl write "Try something else." --to en-US --tone diplomatic
echo

# Show alternatives
echo "10. Show all alternative improvements:"
deepl write "This is a test." --to en-US --alternatives
echo

# Different languages
echo "11. German text improvement:"
deepl write "Das ist ein Satz." --to de
echo

echo "12. Spanish text improvement:"
deepl write "Esta es una oración." --to es
echo

echo "13. French text improvement:"
deepl write "Ceci est une phrase." --to fr
echo

# Prefer styles (fallback if not supported)
echo "14. Prefer business style (with fallback):"
deepl write "We need to discuss this." --to en-US --style prefer_business
echo

echo "15. Bypass cache (always call API):"
deepl write "This is a sentence." --to en-US --no-cache
echo

echo "=== All examples completed successfully! ==="
