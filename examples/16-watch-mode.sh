#!/bin/bash
# Example 16: Watch Mode
# Demonstrates real-time file monitoring and auto-translation

set -e  # Exit on error

echo "=== DeepL CLI Example 16: Watch Mode ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Setup: Create a test directory
TEST_DIR="/tmp/deepl-watch-demo"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"

echo "Created test directory: $TEST_DIR"
echo

# Example 1: Watch a single file
echo "1. Watch a single file for changes"
echo "   Creating a sample file..."
cat > "$TEST_DIR/document.md" << 'EOF'
# Welcome

This is a sample document that will be translated automatically.
EOF

echo "   Starting watch mode (will run for 5 seconds)..."
echo "   In another terminal, try editing $TEST_DIR/document.md"
echo

# Run watch in background for demonstration
deepl watch "$TEST_DIR/document.md" --to es,fr --debounce 1000 &
WATCH_PID=$!

sleep 2

# Make a change to trigger translation
echo "   Making a change to trigger translation..."
cat >> "$TEST_DIR/document.md" << 'EOF'

## New Section

This line was added while watch mode is running.
EOF

sleep 3

# Stop watch mode
kill $WATCH_PID 2>/dev/null || true
wait $WATCH_PID 2>/dev/null || true

echo "   ✓ Watch mode demo completed"
echo

# Example 2: Watch a directory with pattern filtering
echo "2. Watch a directory with glob pattern filtering"
mkdir -p "$TEST_DIR/docs"

cat > "$TEST_DIR/docs/readme.md" << 'EOF'
# README

Project documentation goes here.
EOF

cat > "$TEST_DIR/docs/notes.txt" << 'EOF'
These are plain text notes.
EOF

echo "   Created docs directory with multiple files"
echo "   Watch only .md files with --pattern '*.md'"
echo

# This would run indefinitely in real usage
echo "   Usage: deepl watch $TEST_DIR/docs --to es --pattern '*.md'"
echo "   (Only .md files would be monitored, .txt files ignored)"
echo

# Example 3: Watch with custom output directory
echo "3. Watch with custom output directory"
mkdir -p "$TEST_DIR/src" "$TEST_DIR/translations"

cat > "$TEST_DIR/src/content.md" << 'EOF'
# Content

This content will be saved to a custom directory.
EOF

echo "   Created source directory: $TEST_DIR/src"
echo "   Translations will be saved to: $TEST_DIR/translations"
echo

echo "   Usage: deepl watch $TEST_DIR/src --to de,ja --output $TEST_DIR/translations"
echo

# Example 4: Watch with auto-commit (requires git repo)
echo "4. Watch with auto-commit to git"
echo "   This feature automatically commits translations after each update"
echo

REPO_DIR="$TEST_DIR/git-repo"
mkdir -p "$REPO_DIR"
cd "$REPO_DIR"
git init -q

cat > "README.md" << 'EOF'
# My Project

Welcome to my project.
EOF

git add README.md
git commit -q -m "Initial commit"

echo "   Created git repository: $REPO_DIR"
echo "   Usage: deepl watch README.md --to es --auto-commit"
echo "   Each translation update will create a git commit automatically"
echo

cd - > /dev/null

# Example 5: Watch with formality and code preservation
echo "5. Watch with advanced options"
mkdir -p "$TEST_DIR/technical"

cat > "$TEST_DIR/technical/guide.md" << 'EOF'
# Technical Guide

Use the \`configure()\` function to set up your system.

Example code:
\`\`\`javascript
const result = calculate(42);
\`\`\`
EOF

echo "   Created technical document with code blocks"
echo "   Usage: deepl watch $TEST_DIR/technical --to de --preserve-code --formality more"
echo "   This preserves code blocks and uses formal language"
echo

# Example 6: Watch with custom debounce
echo "6. Watch with custom debounce delay"
echo "   Default debounce: 500ms (waits 500ms after last change)"
echo "   Custom debounce: deepl watch file.md --to es --debounce 1000"
echo "   Use higher debounce for rapidly changing files"
echo

# Example 7: Dry-run preview
echo "=== Example 7: Dry-run Mode ==="
echo

echo "Preview what would be watched without starting the watcher:"
deepl watch "$TEST_DIR/docs" --to es,fr,de --pattern "*.md" --dry-run
echo
echo "Dry-run shows the configuration and matched files without starting the watcher."
echo

# Example 8: Git-staged files (combined with dry-run)
echo "=== Example 8: Git-Staged Files ==="
echo

echo "Watch only git-staged files (useful for pre-commit workflows):"
echo "   deepl watch . --to es --git-staged --dry-run"
echo "   (Requires a git repository with staged files)"
echo

# Example 9: Combined advanced flags
echo "=== Example 9: Advanced Options ==="
echo

echo "Combine multiple flags for a comprehensive setup:"
echo "   deepl watch ./src --to de,ja --from en --glossary project-terms \\"
echo "     --preserve-formatting --preserve-code --formality more --debounce 500"
echo
echo "This combines:"
echo "   --from en              Source language (skip auto-detection)"
echo "   --glossary             Consistent terminology"
echo "   --preserve-formatting  Keep line breaks and whitespace"
echo "   --preserve-code        Protect code blocks"
echo "   --formality more       Formal register"
echo "   --debounce 500         500ms delay before re-translating"
echo

# Cleanup
echo "Cleaning up test directory..."
rm -rf "$TEST_DIR"
echo "✓ Cleanup complete"
echo

echo "=== Watch Mode Features ==="
echo
echo "Real-time monitoring:"
echo "  • Watches files or directories for changes"
echo "  • Automatic translation on file save"
echo "  • Debouncing to avoid excessive API calls"
echo "  • Glob pattern filtering for selective watching"
echo
echo "Output options:"
echo "  • Default: <path>/translations/ or same directory for files"
echo "  • Custom: --output <directory> for organized translations"
echo "  • Preserves directory structure"
echo
echo "Git integration:"
echo "  • --auto-commit: Automatic git commits after translation"
echo "  • Useful for keeping translations in sync with source"
echo "  • Commit messages include file and language info"
echo
echo "Performance tuning:"
echo "  • --debounce <ms>: Adjust delay before translation"
echo "  • --pattern: Filter which files to watch (e.g., '*.md', '**/*.json')"
echo "  • Caching reduces redundant translations"
echo
echo "Preview and scoping:"
echo "  • --dry-run: Preview configuration and matched files without starting the watcher"
echo "  • --git-staged: Watch only git-staged files (ideal for pre-commit workflows)"
echo
echo "💡 Use cases:"
echo "  • Documentation sites with live translation updates"
echo "  • CI/CD pipelines with automated translation"
echo "  • Development workflows with real-time localization"
echo "  • Content management systems with multi-language support"
echo "  • Pre-commit validation with --git-staged and --dry-run"
echo

echo "=== All examples completed successfully! ==="
