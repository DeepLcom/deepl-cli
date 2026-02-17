#!/bin/bash
# Example 3: Batch Processing
# Demonstrates processing multiple files efficiently

set -e  # Exit on error

echo "=== DeepL CLI Example 3: Batch Processing ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Setup: Create multiple sample files in temp directory
SAMPLE_DIR="/tmp/deepl-example-03/sample-files/batch"
OUTPUT_DIR="/tmp/deepl-example-03/output/batch"
RECHECK_DIR="/tmp/deepl-example-03/sample-files/recheck"

rm -rf /tmp/deepl-example-03
mkdir -p "$SAMPLE_DIR" "$OUTPUT_DIR" "$RECHECK_DIR"

# Create sample files
echo "Setting up sample files..."

cat > "$SAMPLE_DIR/intro.md" << 'EOF'
# Introduction

Welcome to our product documentation.
This guide will help you get started quickly.
EOF

cat > "$SAMPLE_DIR/quickstart.md" << 'EOF'
# Quick Start

## Installation

Run the installation command to get started.

## First Steps

Follow these steps to complete your first task.
EOF

cat > "$SAMPLE_DIR/faq.md" << 'EOF'
# Frequently Asked Questions

## How do I install?

Download and run the installer.

## How do I update?

Use the update command.
EOF

cat > "$SAMPLE_DIR/troubleshooting.md" << 'EOF'
# Troubleshooting

## Common Issues

### Issue 1: Installation fails

Check your system requirements.

### Issue 2: Connection error

Verify your network connection.
EOF

echo "✓ Created 4 sample documentation files"
echo

# Example 0: Dry-run preview (see what would happen without translating)
echo "0. Dry-run preview:"
deepl translate "$SAMPLE_DIR" --to es,fr --output "$OUTPUT_DIR/" --pattern "*.md" --dry-run
echo "   (No translations performed — just a preview)"
echo

# Example 1: Translate all files to a single language
echo "1. Translate all markdown files to Spanish"
for file in "$SAMPLE_DIR"/*.md; do
  filename=$(basename "$file" .md)
  echo "   Translating $filename.md..."
  deepl translate "$file" --to es --output "$OUTPUT_DIR/${filename}.es.md"
done
echo "   ✓ All files translated to Spanish"
echo

# Example 2: Translate all files to multiple languages
echo "2. Translate all files to multiple languages (FR, DE)"
for file in "$SAMPLE_DIR"/*.md; do
  filename=$(basename "$file")
  echo "   Translating $filename to FR and DE..."
  deepl translate "$file" --to fr,de --output "$OUTPUT_DIR/"
done
echo "   ✓ All files translated to French and German"
echo

echo "2b. Directory translation with concurrency control:"
deepl translate "$SAMPLE_DIR" --to ja --output "$OUTPUT_DIR/ja/" --pattern "*.md" --concurrency 3
echo "   Translated with max 3 parallel requests"
echo

echo "2c. Non-recursive directory translation (top-level only):"
deepl translate "$SAMPLE_DIR" --to ko --output "$OUTPUT_DIR/ko/" --no-recursive
echo

# Example 3: Count and display results
echo "3. Translation results"
echo "   Source files: $(ls -1 "$SAMPLE_DIR"/*.md | wc -l)"
echo "   Translated files: $(ls -1 "$OUTPUT_DIR"/*.md | wc -l)"
echo
echo "   Languages created:"
echo "   - Spanish (es): $(ls -1 "$OUTPUT_DIR"/*.es.md | wc -l) files"
echo "   - French (fr): $(ls -1 "$OUTPUT_DIR"/*.fr.md | wc -l) files"
echo "   - German (de): $(ls -1 "$OUTPUT_DIR"/*.de.md | wc -l) files"
echo

# Example 4: Organize by language subdirectories
echo "4. Organize translations by language subdirectories"
for lang in es fr de; do
  mkdir -p "$OUTPUT_DIR/$lang"
  mv "$OUTPUT_DIR"/*."$lang".md "$OUTPUT_DIR/$lang/" 2>/dev/null || true
done
echo "   ✓ Files organized by language"
echo
echo "   Directory structure:"
tree "$OUTPUT_DIR" 2>/dev/null || find "$OUTPUT_DIR" -type f | sort
echo

# Example 5: Selective batch translation (only changed files)
echo "5. Selective batch translation (check if translation exists)"

cat > "$RECHECK_DIR/new-doc.md" << 'EOF'
# New Documentation

This is a new document that needs translation.
EOF

echo "   Checking for untranslated files..."
for file in "$RECHECK_DIR"/*.md; do
  filename=$(basename "$file" .md)
  es_output="$OUTPUT_DIR/es/${filename}.es.md"

  if [ ! -f "$es_output" ]; then
    echo "   Missing translation: $filename.md → Spanish"
    echo "   Translating..."
    deepl translate "$file" --to es --output "$OUTPUT_DIR/es/${filename}.es.md"
  else
    echo "   Translation exists: $filename.md (skipping)"
  fi
done
echo

# Example 6: Parallel-style processing with subshells
echo "6. Batch processing with progress tracking"

TOTAL=$(ls -1 "$SAMPLE_DIR"/*.md | wc -l)
CURRENT=0

for file in "$SAMPLE_DIR"/*.md; do
  CURRENT=$((CURRENT + 1))
  filename=$(basename "$file")
  PERCENT=$((CURRENT * 100 / TOTAL))

  echo "   [$CURRENT/$TOTAL - $PERCENT%] Processing $filename..."

  # Translate (use cache for speed)
  deepl translate "$file" --to ja --output "$OUTPUT_DIR/ja/" 2>/dev/null || echo "     (cached or completed)"
done

echo "   ✓ Batch processing complete"
echo

# Example 7: Error handling in batch processing
echo "7. Batch processing with error handling"

SUCCESS=0
FAILED=0
ERRORS_FILE="$OUTPUT_DIR/errors.log"

for file in "$SAMPLE_DIR"/*.md; do
  filename=$(basename "$file")

  if deepl translate "$file" --to ko --output "$OUTPUT_DIR/ko/" 2>>"$ERRORS_FILE"; then
    SUCCESS=$((SUCCESS + 1))
  else
    FAILED=$((FAILED + 1))
    echo "   ❌ Failed: $filename (logged to errors.log)"
  fi
done

echo
echo "   Results:"
echo "   - Success: $SUCCESS files"
echo "   - Failed: $FAILED files"
echo

# Example 8: Cache benefits in batch processing
echo "8. Demonstrate cache benefits in batch processing"
echo "   First run (cache miss):"

deepl cache clear --yes >/dev/null 2>&1

START=$(date +%s)
for file in "$SAMPLE_DIR"/*.md; do
  deepl translate "$file" --to zh --output "$OUTPUT_DIR/zh/" >/dev/null 2>&1 || true
done
END=$(date +%s)
DURATION=$((END - START))

echo "   Time without cache: ${DURATION}s"
echo

echo "   Second run (cache hit):"

START=$(date +%s)
for file in "$SAMPLE_DIR"/*.md; do
  deepl translate "$file" --to zh --output "$OUTPUT_DIR/zh/" >/dev/null 2>&1 || true
done
END=$(date +%s)
CACHED_DURATION=$((END - START))

echo "   Time with cache: ${CACHED_DURATION}s"
echo "   Speed improvement: ~$((DURATION - CACHED_DURATION))s faster"
echo

echo "=== All batch processing examples completed! ==="
echo
echo "📊 Summary:"
echo "   - Source files: 4 markdown files"
echo "   - Languages: ES, FR, DE, JA, KO, ZH (6 languages)"
echo "   - Total translations: 24 files"
echo
echo "💡 Batch processing tips:"
echo "   - Use cache to speed up re-runs"
echo "   - Organize by language subdirectories"
echo "   - Check for existing translations to avoid re-processing"
echo "   - Log errors for debugging"
echo "   - Use progress indicators for large batches"
echo

# Cleanup
echo "Cleaning up temporary files..."
rm -rf /tmp/deepl-example-03
echo "✓ Cleanup complete"

echo "=== All examples completed successfully! ==="
