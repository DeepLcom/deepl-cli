#!/bin/bash
# Example 35: Style Rules CRUD
# End-to-end walkthrough of creating, updating, and deleting a style rule,
# including custom instruction management. Pro API only.

set -e

echo "=== DeepL CLI Example 35: Style Rules CRUD ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo
echo "Note: Style rules require a Pro API key. On Free-tier keys,"
echo "each command below will return a Pro-only error, which is expected."
echo

# Capture a style id on exit so we can clean up if anything fails partway
STYLE_ID=""
cleanup() {
  if [[ -n "${STYLE_ID}" ]]; then
    echo
    echo "Cleanup: removing test style rule ${STYLE_ID}"
    deepl style-rules delete "${STYLE_ID}" --yes 2>/dev/null || true
  fi
}
trap cleanup EXIT

# 1. Create a style rule (French so the punctuation rule below applies)
echo "1. Creating a new style rule"
CREATE_OUTPUT=$(deepl style-rules create --name "Example Corporate" --language fr --format json 2>&1)
echo "${CREATE_OUTPUT}"
if command -v jq &>/dev/null; then
  STYLE_ID=$(echo "${CREATE_OUTPUT}" | jq -r '.styleId // empty' 2>/dev/null || true)
else
  echo "(jq not installed — install jq to capture the style id and run the full demo)"
  exit 0
fi
if [[ -z "${STYLE_ID}" ]]; then
  echo "(Skipping remainder — no style id captured; likely a Pro-only error)"
  exit 0
fi
echo "Created style rule: ${STYLE_ID}"
echo

# 2. Show the rule (detailed)
echo "2. Showing the rule (detailed)"
deepl style-rules show "${STYLE_ID}" --detailed
echo

# 3. Replace configured rules (--rules takes a JSON object: category → settings)
echo "3. Replacing configured rules"
deepl style-rules update "${STYLE_ID}" --rules '{"punctuation":{"quotation_mark":"use_guillemets"}}'
echo

# 4. Add a custom instruction
echo "4. Adding a custom instruction"
deepl style-rules add-instruction "${STYLE_ID}" tone "Be formal and courteous"
echo

# 5. List custom instructions
echo "5. Listing custom instructions"
deepl style-rules instructions "${STYLE_ID}"
echo

# 6. Update the instruction's prompt
echo "6. Updating the instruction's prompt"
deepl style-rules update-instruction "${STYLE_ID}" tone "Be warm but professional"
echo

# 7. Remove the instruction (skipping confirmation for the script)
echo "7. Removing the instruction"
deepl style-rules remove-instruction "${STYLE_ID}" tone --yes
echo

# 8. Rename the rule
echo "8. Renaming the rule"
deepl style-rules update "${STYLE_ID}" --name "Example Corporate (renamed)"
echo

# 9. Delete the rule (cleanup trap will also catch this but we do it explicitly)
echo "9. Deleting the rule"
deepl style-rules delete "${STYLE_ID}" --yes
STYLE_ID=""
echo

echo "=== Example 35 complete ==="
