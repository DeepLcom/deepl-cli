#!/bin/bash
# Run All Examples - Validation Script
# Runs all DeepL CLI example scripts for testing and validation

set +e  # Don't exit on error, we want to run all examples

echo "=== Running All DeepL CLI Examples ==="
echo "This will run all example scripts and report results."
echo "⚠️  Warning: This will make real API calls and consume quota."
echo

# Check API key first
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key required to run examples"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Parse arguments
STOP_ON_ERROR=false
FAST_MODE=false

for arg in "$@"; do
  case $arg in
    --stop-on-error)
      STOP_ON_ERROR=true
      shift
      ;;
    --fast)
      FAST_MODE=true
      shift
      ;;
    --help)
      echo "Usage: ./examples/run-all.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --stop-on-error   Stop running examples after first failure"
      echo "  --fast            Skip slow examples (watch mode, git hooks)"
      echo "  --help            Show this help message"
      exit 0
      ;;
  esac
done

# List of all examples
EXAMPLES=(
  "01-basic-translation.sh"
  "02-file-translation.sh"
  "03-glossaries.sh"
  "04-configuration.sh"
  "05-cache.sh"
  "06-cicd-integration.sh"
  "07-batch-processing.sh"
  "08-context-aware-translation.sh"
  "09-write-basic.sh"
  "10-usage-monitoring.sh"
  "11-languages.sh"
  "12-model-type-selection.sh"
  "13-watch-mode.sh"
  "14-git-hooks.sh"
  "15-document-translation.sh"
  "16-document-format-conversion.sh"
  "17-custom-config-files.sh"
  "18-cost-transparency.sh"
  "19-xml-tag-handling.sh"
  "20-table-output.sh"
)

# Skip slow examples in fast mode
if [ "$FAST_MODE" = true ]; then
  echo "ℹ️  Fast mode enabled - skipping slow examples (13, 14)"
  echo
  EXAMPLES=(
    "01-basic-translation.sh"
    "02-file-translation.sh"
    "03-glossaries.sh"
    "04-configuration.sh"
    "05-cache.sh"
    "06-cicd-integration.sh"
    "07-batch-processing.sh"
    "08-context-aware-translation.sh"
    "09-write-basic.sh"
    "10-usage-monitoring.sh"
    "11-languages.sh"
    "12-model-type-selection.sh"
    "15-document-translation.sh"
    "16-document-format-conversion.sh"
    "17-custom-config-files.sh"
    "18-cost-transparency.sh"
    "19-xml-tag-handling.sh"
    "20-table-output.sh"
  )
fi

# Run each example and track results
PASSED=()
FAILED=()
TOTAL=${#EXAMPLES[@]}
CURRENT=0

for script in "${EXAMPLES[@]}"; do
  CURRENT=$((CURRENT + 1))
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Running example $CURRENT/$TOTAL: $script"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo

  if bash "examples/$script"; then
    echo
    echo "✅ Example $script passed"
    PASSED+=("$script")
  else
    echo
    echo "❌ Example $script failed"
    FAILED+=("$script")

    if [ "$STOP_ON_ERROR" = true ]; then
      echo
      echo "Stopping due to --stop-on-error flag"
      break
    fi
  fi

  echo
  echo
done

# Summary report
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "=== Summary ==="
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "Total examples: $TOTAL"
echo "Passed: ${#PASSED[@]}"
echo "Failed: ${#FAILED[@]}"
echo

if [ ${#FAILED[@]} -eq 0 ]; then
  echo "✅ All examples passed successfully!"
  echo
  exit 0
else
  echo "❌ Some examples failed:"
  for script in "${FAILED[@]}"; do
    echo "   - $script"
  done
  echo
  exit 1
fi
