#!/bin/bash

# Example: Using DeepL Write API for text improvement
# This example demonstrates grammar, style, and tone enhancement

echo "=== DeepL Write API Examples ==="
echo

# NOTE: Replace with your actual DeepL API key
# export DEEPL_API_KEY="your-api-key-here"

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

echo "Done!"
