#!/bin/bash
# diff-locale-keys.sh — Find missing/extra/empty keys between two JSON locale files
#
# Usage: diff-locale-keys.sh <source.json> <target.json>
# Output: Lists of missing keys, extra keys, and empty values in target

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <source.json> <target.json>"
  exit 1
fi

SOURCE="$1"
TARGET="$2"

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not installed."
  echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
  exit 1
fi

if [ ! -f "$SOURCE" ]; then
  echo "Error: Source file not found: $SOURCE"
  exit 1
fi

if [ ! -f "$TARGET" ]; then
  echo "Target file does not exist: $TARGET"
  echo "All source keys are missing."
  jq -r '[paths(scalars)] | .[] | join(".")' "$SOURCE"
  exit 0
fi

# Extract leaf key paths (dot-separated)
source_keys=$(jq -r '[paths(scalars)] | .[] | join(".")' "$SOURCE" | sort)
target_keys=$(jq -r '[paths(scalars)] | .[] | join(".")' "$TARGET" | sort)

# Find missing keys (in source but not in target)
missing=$(comm -23 <(echo "$source_keys") <(echo "$target_keys"))

# Find extra keys (in target but not in source)
extra=$(comm -13 <(echo "$source_keys") <(echo "$target_keys"))

# Find empty values in target
empty=$(jq -r '[path(.. | scalars | select(. == ""))] | .[] | join(".")' "$TARGET" 2>/dev/null | sort || true)

# Report
has_issues=0

if [ -n "$missing" ]; then
  count=$(echo "$missing" | wc -l | tr -d ' ')
  echo "MISSING ($count keys in source but not in target):"
  echo "$missing" | while read -r key; do echo "  + $key"; done
  echo
  has_issues=1
fi

if [ -n "$extra" ]; then
  count=$(echo "$extra" | wc -l | tr -d ' ')
  echo "EXTRA ($count keys in target but not in source):"
  echo "$extra" | while read -r key; do echo "  - $key"; done
  echo
  has_issues=1
fi

if [ -n "$empty" ]; then
  count=$(echo "$empty" | wc -l | tr -d ' ')
  echo "EMPTY ($count keys with empty values in target):"
  echo "$empty" | while read -r key; do echo "  ? $key"; done
  echo
  has_issues=1
fi

if [ "$has_issues" -eq 0 ]; then
  echo "OK: Source and target have identical key structure with no empty values."
fi
