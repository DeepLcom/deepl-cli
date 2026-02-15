#!/bin/bash
# Example 26: Shell Completions
# Demonstrates generating shell completion scripts for bash, zsh, and fish

set -e

echo "=== DeepL CLI Example 26: Shell Completions ==="
echo

echo "1. Generate bash completion (preview):"
deepl completion bash | head -5
echo "   ..."
echo

echo "2. Generate zsh completion (preview):"
deepl completion zsh | head -5
echo "   ..."
echo

echo "3. Generate fish completion (preview):"
deepl completion fish | head -5
echo "   ..."
echo

echo "4. Direct sourcing (for testing in current session):"
echo "   Bash: source <(deepl completion bash)"
echo '   Zsh:  eval "$(deepl completion zsh)"'
echo "   Fish: deepl completion fish | source"
echo

echo "5. Permanent installation:"
echo "   Bash:"
echo "     deepl completion bash > /etc/bash_completion.d/deepl"
echo "     # Or for user-level:"
echo "     deepl completion bash > ~/.local/share/bash-completion/completions/deepl"
echo
echo "   Zsh:"
echo '     deepl completion zsh > "${fpath[1]}/_deepl"'
echo "     # Then add to .zshrc: autoload -Uz compinit && compinit"
echo
echo "   Fish:"
echo "     deepl completion fish > ~/.config/fish/completions/deepl.fish"
echo

echo "=== Shell Completions Examples Complete ==="
echo
echo "Tips:"
echo "  - Completions cover all commands, subcommands, and flags"
echo "  - Regenerate after upgrading deepl-cli"
echo "  - Works without an API key"
