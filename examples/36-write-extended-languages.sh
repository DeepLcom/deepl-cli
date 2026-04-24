#!/bin/bash
# Example 36: Write — extended language coverage
# Demonstrates JA/KO/ZH/zh-Hans target languages and
# tone / style applied to ES/IT/FR/PT variants.

set -e

echo "=== DeepL CLI Example 36: Write — Extended Language Coverage ==="
echo

if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# CJK targets
echo "1. Japanese target"
deepl write "この文章を改善してください。" --lang ja
echo

echo "2. Korean target"
deepl write "이 문장을 개선해 주세요." --lang ko
echo

echo "3. Simplified Chinese target (zh)"
deepl write "请改进这句话。" --lang zh
echo

echo "4. Simplified Chinese target (zh-Hans)"
deepl write "请改进这句话。" --lang zh-Hans
echo

# Tone / style on Romance variants
echo "5. Spanish + business style"
deepl write "Quiero comprar su producto." --lang es --style business
echo

echo "6. Italian + casual style"
deepl write "Voglio comprare questo prodotto." --lang it --style casual
echo

echo "7. French + academic style"
deepl write "Les résultats montrent une corrélation." --lang fr --style academic
echo

echo "8. Portuguese (Brazil) + friendly tone"
deepl write "Podemos ajudar com isso." --lang pt-BR --tone friendly
echo

echo "9. Portuguese (Portugal) + confident tone"
deepl write "Vamos entregar no prazo." --lang pt-PT --tone confident
echo

# Auto-detect round-trip for a CJK input
echo "10. Auto-detect (no --lang) rephrase of a Korean input"
deepl write "이 문장을 개선해 주세요."
echo

echo "=== Example 36 complete ==="
