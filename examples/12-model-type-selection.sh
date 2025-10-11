#!/bin/bash

# Example 12: Model Type Selection
# Demonstrates using different model types for quality vs. speed trade-offs

set -e

echo "======================================"
echo "Model Type Selection Examples"
echo "======================================"
echo ""

# Example 1: Quality Optimized (default)
echo "1. Quality Optimized (best quality, standard latency)"
echo "   Use for: Documents, marketing content, important communications"
echo ""
deepl translate "The innovative solution revolutionizes the industry landscape." \
  --to es \
  --model-type quality_optimized
echo ""

# Example 2: Latency Optimized (faster responses)
echo "2. Latency Optimized (faster, slightly lower quality)"
echo "   Use for: Real-time chat, live subtitles, interactive applications"
echo ""
deepl translate "User sent a new message in the chat." \
  --to ja \
  --model-type latency_optimized
echo ""

# Example 3: Prefer Quality Optimized (with fallback)
echo "3. Prefer Quality Optimized (quality with fallback)"
echo "   Use for: When quality is preferred but latency is acceptable fallback"
echo ""
deepl translate "Please review the attached quarterly financial report." \
  --to de \
  --model-type prefer_quality_optimized
echo ""

# Example 4: Comparing model types side-by-side
echo "4. Comparing different model types for the same text:"
echo ""
TEXT="Artificial intelligence is transforming the way we work and live."

echo "   Quality Optimized:"
deepl translate "$TEXT" --to fr --model-type quality_optimized
echo ""

echo "   Latency Optimized:"
deepl translate "$TEXT" --to fr --model-type latency_optimized
echo ""

# Example 5: Model type with file translation
echo "5. Using model type with file translation:"
echo "   Creating a sample markdown file..."
cat > /tmp/sample-doc.md << 'EOF'
# Technical Documentation

This document describes the system architecture and implementation details.

## Overview

The platform uses a microservices architecture with containerized deployments.
EOF

echo "   Translating with quality_optimized model..."
deepl translate /tmp/sample-doc.md \
  --to es \
  --output /tmp/sample-doc.es.md \
  --model-type quality_optimized \
  --preserve-code

echo "   ✓ Translation complete: /tmp/sample-doc.es.md"
echo ""

# Example 6: Model type with multiple target languages
echo "6. Using model type with multiple languages:"
deepl translate "Welcome to our platform!" \
  --to es,fr,de,ja \
  --model-type quality_optimized
echo ""

# Example 7: Real-time chat scenario (latency optimized)
echo "7. Real-time chat translation (latency optimized):"
echo "   Simulating rapid chat messages..."

MESSAGES=(
  "Hi there!"
  "How can I help you today?"
  "I need assistance with my order"
  "Sure, let me check that for you"
)

for msg in "${MESSAGES[@]}"; do
  echo "   Original: $msg"
  echo -n "   Translated: "
  deepl translate "$msg" --to es --model-type latency_optimized
  echo ""
done

echo ""
echo "======================================"
echo "Model Type Selection Guide"
echo "======================================"
echo ""
echo "quality_optimized (default):"
echo "  • Best translation quality"
echo "  • Standard latency"
echo "  • Use for: Documents, marketing, professional content"
echo ""
echo "prefer_quality_optimized:"
echo "  • Prefers quality model"
echo "  • Falls back to latency if unavailable"
echo "  • Use for: Important content with some flexibility"
echo ""
echo "latency_optimized:"
echo "  • Faster response times"
echo "  • Slightly lower quality"
echo "  • Use for: Real-time chat, live subtitles, interactive apps"
echo ""
echo "💡 Tip: For most use cases, the default quality_optimized model"
echo "   provides the best results. Use latency_optimized only when"
echo "   response time is critical."
echo ""
