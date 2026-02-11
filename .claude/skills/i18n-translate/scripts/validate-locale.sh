#!/bin/bash
# validate-locale.sh — Verify translated locale file integrity
#
# Usage: validate-locale.sh <source.json> <translated.json> [--framework <name>]
# Checks: valid JSON, key match, variables preserved, no placeholder residue

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <source.json> <translated.json> [--framework <name>]"
  exit 1
fi

SOURCE="$1"
TRANSLATED="$2"
FRAMEWORK="generic"

shift 2
while [ $# -gt 0 ]; do
  case "$1" in
    --framework) FRAMEWORK="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not installed."
  exit 1
fi

errors=0

# Check 1: Valid JSON
echo "Checking: Valid JSON..."
if ! jq empty "$TRANSLATED" 2>/dev/null; then
  echo "  FAIL: $TRANSLATED is not valid JSON"
  errors=$((errors + 1))
else
  echo "  OK"
fi

# Check 2: Key structure match
echo "Checking: Key structure..."
source_keys=$(jq -r '[paths(scalars)] | .[] | join(".")' "$SOURCE" | sort)
translated_keys=$(jq -r '[paths(scalars)] | .[] | join(".")' "$TRANSLATED" | sort)

missing=$(comm -23 <(echo "$source_keys") <(echo "$translated_keys"))
extra=$(comm -13 <(echo "$source_keys") <(echo "$translated_keys"))

if [ -n "$missing" ]; then
  count=$(echo "$missing" | wc -l | tr -d ' ')
  echo "  FAIL: $count missing keys"
  echo "$missing" | head -5 | while read -r k; do echo "    - $k"; done
  errors=$((errors + 1))
fi
if [ -n "$extra" ]; then
  count=$(echo "$extra" | wc -l | tr -d ' ')
  echo "  WARN: $count extra keys (may be stale)"
  echo "$extra" | head -5 | while read -r k; do echo "    - $k"; done
fi
if [ -z "$missing" ] && [ -z "$extra" ]; then
  echo "  OK"
fi

# Check 3: No placeholder residue
echo "Checking: No placeholder residue..."
if grep -qE '__INTL_[0-9]+__|__VAR_[0-9]+__' "$TRANSLATED"; then
  residue=$(grep -oE '__INTL_[0-9]+__|__VAR_[0-9]+__' "$TRANSLATED" | sort -u)
  count=$(echo "$residue" | wc -l | tr -d ' ')
  echo "  FAIL: $count unreplaced placeholders found"
  echo "$residue" | while read -r p; do echo "    - $p"; done
  errors=$((errors + 1))
else
  echo "  OK"
fi

# Check 4: Variable preservation
echo "Checking: Variable preservation..."

# Build regex based on framework
case "$FRAMEWORK" in
  i18next)    var_regex='\{\{[a-zA-Z0-9_]+\}\}' ;;
  rails)      var_regex='%\{[a-zA-Z0-9_]+\}' ;;
  angular)    var_regex='\{\{[a-zA-Z0-9_]+\}\}' ;;
  vue-i18n)   var_regex='\{[a-zA-Z0-9_]+\}|@:[a-zA-Z0-9_.]+' ;;
  react-intl) var_regex='\{[a-zA-Z0-9_]+\}' ;;
  next-intl)  var_regex='\{[a-zA-Z0-9_]+\}' ;;
  flutter)    var_regex='\{[a-zA-Z0-9_]+\}' ;;
  *)          var_regex='\{[a-zA-Z0-9_]+\}|\$\{[a-zA-Z0-9_]+\}|%[sd]' ;;
esac

# Extract variables from each leaf value and compare
var_issues=0
while IFS= read -r key; do
  src_val=$(jq -r --argjson p "$key" 'getpath($p)' "$SOURCE")
  tgt_val=$(jq -r --argjson p "$key" 'getpath($p)' "$TRANSLATED" 2>/dev/null || echo "")

  if [ -z "$tgt_val" ]; then
    continue
  fi

  src_vars=$(echo "$src_val" | grep -oE "$var_regex" --color=never 2>/dev/null | sort || true)
  tgt_vars=$(echo "$tgt_val" | grep -oE "$var_regex" --color=never 2>/dev/null | sort || true)

  if [ "$src_vars" != "$tgt_vars" ]; then
    dotkey=$(echo "$key" | jq -r 'join(".")')
    echo "  FAIL: Variable mismatch in '$dotkey'"
    echo "    source: $src_vars"
    echo "    target: $tgt_vars"
    var_issues=$((var_issues + 1))
  fi
done < <(jq -c '[paths(scalars)][]' "$SOURCE")

if [ "$var_issues" -eq 0 ]; then
  echo "  OK"
else
  errors=$((errors + var_issues))
fi

# Check 5: Untranslated values (warning only)
echo "Checking: Untranslated values..."
identical=0
while IFS= read -r key; do
  src_val=$(jq -r --argjson p "$key" 'getpath($p)' "$SOURCE")
  tgt_val=$(jq -r --argjson p "$key" 'getpath($p)' "$TRANSLATED" 2>/dev/null || echo "")
  if [ "$src_val" = "$tgt_val" ] && [ -n "$src_val" ]; then
    identical=$((identical + 1))
  fi
done < <(jq -c '[paths(scalars)][]' "$SOURCE")

total=$(echo "$source_keys" | wc -l | tr -d ' ')
if [ "$identical" -gt 0 ]; then
  echo "  WARN: $identical/$total values identical to source (may be intentional for brand names, URLs, etc.)"
else
  echo "  OK"
fi

# Summary
echo
if [ "$errors" -gt 0 ]; then
  echo "RESULT: FAIL ($errors errors found)"
  exit 1
else
  echo "RESULT: PASS"
  exit 0
fi
