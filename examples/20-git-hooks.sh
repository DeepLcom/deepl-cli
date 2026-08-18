#!/bin/bash
# Git Hooks Integration
# Demonstrates automating translation validation in git workflow

set -e  # Exit on error

echo "=== DeepL CLI: Git Hooks Integration ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl init, or: deepl auth set-key --from-stdin < keyfile"
  exit 1
fi

echo "✓ API key configured"
echo

# Setup: Create a test git repository
TEST_DIR="/tmp/deepl-hooks-demo"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

git init -q
echo "Created test git repository: $TEST_DIR"
echo

# Example 1: List available hooks
echo "1. List all hooks and their status"
deepl hooks list
echo

# Example 2: Install pre-commit hook
echo "2. Install pre-commit hook"
echo "   This hook validates translations before allowing commits"
deepl hooks install pre-commit
echo

# Verify installation
echo "3. Verify hook installation"
deepl hooks list
echo

# Example 3: Show hook path
echo "4. Show hook file path"
deepl hooks path pre-commit
echo

# Example 4: Test pre-commit hook
echo "5. Test pre-commit hook behavior"
echo "   Creating a sample file..."

cat > "README.md" << 'EOF'
# My Project

Welcome to my project. This is the main documentation.
EOF

cat > "README.es.md" << 'EOF'
# Mi Proyecto

Bienvenido a mi proyecto. Esta es la documentación principal.
EOF

git add README.md README.es.md

echo "   Added English and Spanish versions"
echo "   Attempting to commit (hook will validate translations)..."
echo

git commit -m "Add README with Spanish translation" || echo "   (Commit would succeed if translations are valid)"
echo

# Example 5: Install pre-push hook
echo "6. Install pre-push hook"
echo "   This hook validates all translations before pushing"
deepl hooks install pre-push
echo

# Example 6: Install commit-msg hook
echo "=== Example 6: Commit-msg Hook ==="
echo

deepl hooks install commit-msg
echo "   commit-msg hook validates or enriches commit messages with translation metadata"
echo

# Example 7: Install post-commit hook
echo "=== Example 7: Post-commit Hook ==="
echo

deepl hooks install post-commit
echo "   post-commit hook automatically triggers translation of changed files after each commit"
echo

# Example 8: List hooks and JSON format
echo "8. Verify hooks are installed"
deepl hooks list
echo

echo "8b. List hooks in JSON format (for CI/CD scripting):"
deepl hooks list --format json
echo

# Example 9: Uninstall hooks
echo "9. Uninstall hooks"
echo "   Uninstalling pre-commit hook..."
deepl hooks uninstall pre-commit
echo

echo "   Uninstalling pre-push hook..."
deepl hooks uninstall pre-push
echo

echo "   Uninstalling commit-msg hook..."
deepl hooks uninstall commit-msg
echo

echo "   Uninstalling post-commit hook..."
deepl hooks uninstall post-commit
echo

# Example 10: Re-check status
echo "10. Verify hooks are uninstalled"
deepl hooks list
echo

# Cleanup
cd - > /dev/null
rm -rf "$TEST_DIR"
echo "✓ Cleanup complete"
echo

echo "=== Git Hooks Features ==="
echo
echo "Available hooks:"
echo "  • pre-commit: Validates translations before each commit"
echo "  • pre-push: Validates all translations before pushing to remote"
echo "  • commit-msg: Validates or enriches commit messages with translation metadata"
echo "  • post-commit: Automatically triggers translation of changed files after each commit"
echo
echo "Hook behavior:"
echo "  • Checks translation file pairs (e.g., README.md + README.es.md)"
echo "  • Validates that translations are in sync with source"
echo "  • Blocks commit/push if validation fails"
echo "  • Provides clear error messages for fixing issues"
echo
echo "Installation safety:"
echo "  • Automatically backs up existing hooks"
echo "  • Won't overwrite custom hooks without backup"
echo "  • Easy uninstallation without data loss"
echo
echo "Management commands:"
echo "  • deepl hooks install <type>   - Install a hook"
echo "  • deepl hooks uninstall <type> - Remove a hook"
echo "  • deepl hooks list             - Show all hooks status"
echo "  • deepl hooks path <type>      - Show hook file location"
echo
echo "💡 Use cases:"
echo "  • Enforce translation quality before commits"
echo "  • Prevent pushing incomplete translations"
echo "  • Automate translation validation in team workflows"
echo "  • Integrate with CI/CD pipelines"
echo "  • Maintain consistency across localized content"
echo
echo "⚙️  Customization:"
echo "  • Hook scripts are customizable shell files"
echo "  • Located in .git/hooks/"
echo "  • Can be modified for project-specific workflows"
echo "  • Integrate with other git hooks if needed"
echo
echo "🔒 Team collaboration:"
echo "  • Each developer installs hooks locally"
echo "  • Provides consistent validation across team"
echo "  • Catches translation issues early"
echo "  • Reduces manual translation review burden"
echo

echo "=== All examples completed successfully! ==="
