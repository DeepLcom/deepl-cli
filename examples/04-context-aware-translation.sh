#!/bin/bash
# Example 4: Context-Aware Translation
# Demonstrates using context to improve translation quality

set -e  # Exit on error

echo "=== DeepL CLI Example 4: Context-Aware Translation ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Example 1: Ambiguous word without context
echo "1. Translating ambiguous word 'bank' without context"
echo "   English → Spanish:"
deepl translate "bank" --to es
echo

# Example 2: Same word with financial context
echo "2. Same word 'bank' with financial context"
echo "   Context: 'This document discusses financial institutions'"
deepl translate "bank" --to es --context "This document discusses financial institutions"
echo

# Example 3: Same word with geographical context
echo "3. Same word 'bank' with geographical context"
echo "   Context: 'This document is about rivers and geography'"
deepl translate "bank" --to es --context "This document is about rivers and geography"
echo

# Example 4: Technical term - "memory" in computing context
echo "4. Technical term 'memory' in computing context"
echo "   English → German:"
deepl translate "memory" --to de --context "computer programming and software development"
echo

# Example 5: Same term in psychology context
echo "5. Same term 'memory' in psychology context"
echo "   Context: 'psychology and human cognition'"
deepl translate "memory" --to de --context "psychology and human cognition"
echo

# Example 6: Business term with context
echo "6. Business term 'quarter' with financial context"
echo "   English → French:"
deepl translate "The quarter ended strongly" --to fr --context "corporate financial reporting"
echo

# Example 7: Context with formality
echo "7. Combining context with formality"
echo "   'How are you?' with formal business context:"
deepl translate "How are you?" --to de --context "Formal business email correspondence" --formality more
echo

# Example 8: Multiple target languages with context
echo "8. Multiple target languages with shared context"
echo "   Word: 'trunk' (car context)"
echo "   Languages: ES, FR, DE"
deepl translate "trunk" --to es,fr,de --context "automobile and car parts"
echo

# Example 9: Sentence with technical jargon
echo "9. Technical sentence with context"
echo "   Sentence: 'The application crashed due to a memory leak'"
deepl translate "The application crashed due to a memory leak" --to ja --context "software engineering and debugging"
echo

# Example 10: Context for idiomatic expressions
echo "10. Idiomatic expression with cultural context"
echo "    Expression: 'break the ice'"
deepl translate "break the ice" --to es --context "social situations and meeting new people"
echo

echo "=== All context-aware translation examples completed! ==="
echo
echo "💡 Key takeaways:"
echo "   - Context helps disambiguate words with multiple meanings"
echo "   - Technical terms benefit greatly from domain context"
echo "   - Context can be combined with other options (formality, etc.)"
echo "   - Keep context concise but informative (1-2 sentences)"
echo "   - Context describes the subject matter, not grammar"
echo
echo "📚 Common use cases for context:"
echo "   - Technical documentation (specify the domain)"
echo "   - Business communications (specify the industry)"
echo "   - Medical/legal texts (specify the field)"
echo "   - Ambiguous terms (provide clarification)"
echo "   - Cultural references (provide cultural context)"
