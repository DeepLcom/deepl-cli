# v3 Glossary API - Manual Test Report

**Date:** 2025-10-13
**Tester:** Claude Code
**API Key Type:** Free Tier
**Test Environment:** macOS, Node.js

## Summary

Manual testing of the v3 glossary API implementation revealed several issues:

1. ✅ **Fixed:** API response structure mismatch
2. ⚠️ **Issue:** Empty `dictionaries` array in create response
3. ⚠️ **Bug:** `getGlossaryEntries()` fails with "tsv.split is not a function"
4. ⚠️ **Missing:** `--target` flag not implemented in CLI commands

## Test Findings

### 1. API Response Structure Mismatch (FIXED)

**Issue:** The actual v3 API response does NOT include `source_lang` or `target_langs` at the root level.

**Expected (from initial type definition):**
```typescript
{
  glossary_id: string;
  name: string;
  source_lang: Language;      // ❌ Not in actual response
  target_langs: Language[];   // ❌ Not in actual response
  dictionaries: LanguagePairInfo[];
  creation_time: string;
}
```

**Actual API Response:**
```json
{
  "glossary_id": "e685d274-e552-4ff6-9b1f-76ea5a1eb458",
  "name": "v3-fixed-test",
  "dictionaries": [],
  "creation_time": "2025-10-13T13:47:46.381639Z"
}
```

**Fix Applied:**
- Added `GlossaryApiResponse` type matching actual API structure
- Added `normalizeGlossaryInfo()` to derive `source_lang` and `target_langs` from dictionaries
- Updated all API client methods to normalize responses

**Commit:** `670a313` - fix(types): match actual v3 API response structure

### 2. Empty Dictionaries in Create Response (INVESTIGATING)

**Issue:** When creating a glossary via `/v3/glossaries`, the response includes an empty `dictionaries` array.

**Test Case:**
```bash
# Created test glossary with 3 entries (en→es)
deepl glossary create "CLI-v3-Test" en es /tmp/test-glossary.tsv

# Immediate response:
Name: CLI-v3-Test
ID: bea0479f-3b4a-4c61-bd61-bc43b787ad4a
Source language: en
Target languages:           # Empty!
Type: Single target
Total entries: 0            # Empty!

# After 5 seconds - still empty
deepl glossary show "CLI-v3-Test"
# dictionaries: []  - still empty
```

**Observations:**
- Existing glossaries (from deepl-python tests) have populated `dictionaries` arrays
- All test glossaries show 2 dictionaries (bidirectional: en↔de creates en→de + de→en)
- Newly created glossaries remain empty even after 5+ seconds

**Hypothesis:**
- v3 API may process glossaries asynchronously
- OR there's an issue with how we're sending the request
- OR free tier API keys have limited v3 functionality

**Action Needed:**
- Investigate if `ready` field indicates processing status
- Check if we need to poll the API until dictionaries are populated
- Verify request format matches DeepL documentation exactly

### 3. getGlossaryEntries() Bug (NOT FIXED)

**Issue:** Calling `deepl glossary entries <id>` fails with runtime error.

**Error:**
```
Error: tsv.split is not a function
```

**Root Cause:**
The `getGlossaryEntries()` method in `deepl-client.ts` uses `this.client.get()` directly:

```typescript
const response = await this.client.get<string>(
  `/v3/glossaries/${glossaryId}/entries`,
  {
    headers: {
      Accept: 'text/tab-separated-values',
    },
  }
);
return response.data;
```

Axios defaults to `responseType: 'json'` even with `Accept: 'text/tab-separated-values'`.
The response is being parsed as JSON/object instead of kept as a string.

**Fix Required:**
```typescript
const response = await this.client.get<string>(
  `/v3/glossaries/${glossaryId}/entries`,
  {
    params: {
      source_lang: sourceLang.toUpperCase(),
      target_lang: targetLang.toUpperCase(),
    },
    headers: {
      Accept: 'text/tab-separated-values',
    },
    responseType: 'text',  // ← Add this
  }
);
```

**Status:** Deferred (discovered during testing, not blocking v3 implementation validation)

### 4. Missing --target Flag in CLI (NOT IMPLEMENTED)

**Issue:** CLI commands don't expose the `--target` parameter required for multilingual glossaries.

**Commands Missing --target:**
- `deepl glossary entries <name-or-id>` - No `--target` flag
- `deepl glossary add-entry <name-or-id> <source> <target>` - No `--target` flag
- `deepl glossary update-entry <name-or-id> <source> <new-target>` - No `--target` flag
- `deepl glossary remove-entry <name-or-id> <source>` - No `--target` flag

**Expected Behavior:**
```bash
# For single-target glossaries (optional)
deepl glossary entries my-glossary

# For multilingual glossaries (required)
deepl glossary entries my-glossary --target es
deepl glossary entries my-glossary --target fr
```

**Implementation Status:**
- ✅ Command methods support `targetLang?` parameter
- ❌ CLI commands don't expose `--target` option
- ✅ Helper functions validate and default appropriately

**Fix Required:**
Update CLI command definitions in `src/cli/index.ts` to add `.option('--target <lang>', 'Target language')`

**Status:** Deferred (feature complete at service layer, needs CLI wiring)

## Successful Tests

### Glossary List

**Command:** `deepl glossary list`

**Result:** ✅ Success
- Lists all existing glossaries correctly
- Shows multilingual indicator (📚) vs single-target (📖)
- Displays entry counts from dictionaries
- Proper formatting for glossaries with multiple targets

**Sample Output:**
```
📚 deepl-python-test-glossary: test... (en→2 targets) - 2 entries
📖 deepl-php-test-glossary: ... (en→de) - 2 entries
📖 Test Glossary (de→fr) - 1 entries
```

### Glossary Show

**Command:** `deepl glossary show <id>`

**Result:** ✅ Success (for existing glossaries)
- Correctly displays glossary metadata
- Shows language pairs for multilingual glossaries
- Proper entry count totals

**Sample Output:**
```
Name: deepl-python-test-glossary: test_glossary_create...
ID: e4d8bf60-f24f-45e8-b1ae-f4388694a6df
Source language: en
Target languages: de, en
Type: Multilingual
Total entries: 2
Created: 7/8/2025, 10:05:41 PM

Language pairs:
  en → de: 1 entries
  de → en: 1 entries
```

### Glossary Delete

**Command:** `deepl glossary delete <name-or-id>`

**Result:** ✅ Success
- Successfully deletes glossaries by name or ID
- Shows success confirmation

## Remaining Work

### Blocking Issues for v3 Release

1. **Investigate empty dictionaries** - Determine if this is expected behavior or a bug
   - Check DeepL official SDKs for comparison
   - Review v3 API documentation for async processing
   - Consider adding polling/retry logic if needed

2. **Fix getGlossaryEntries** - Add `responseType: 'text'` to axios call
   - Quick fix, low risk
   - Enables `glossary entries` command to work

3. **Add --target CLI flags** - Wire up existing functionality to CLI
   - Required for multilingual glossary operations
   - Implementation pattern exists, just needs CLI commands updated

### Non-Blocking Improvements

4. **Update examples** - Add v3-specific examples
5. **Documentation audit** - Verify all docs match implementation
6. **CHANGELOG** - Document v3 glossary changes for next release

## Recommendations

1. **Priority 1:** Resolve empty dictionaries issue
   - This blocks validating that glossary creation actually works
   - May require contacting DeepL support if it's API-specific behavior

2. **Priority 2:** Fix getGlossaryEntries axios configuration
   - Simple one-line fix
   - Enables full testing of glossary workflow

3. **Priority 3:** Add --target flags to CLI
   - Required for multilingual glossary support
   - Straightforward implementation

4. **Consider:** Add `ready` field handling
   - If v3 API uses async processing, add polling logic
   - Show "Processing..." status until glossaries are ready

## Test Environment Details

**API Endpoint:** `https://api-free.deepl.com/v3/glossaries`
**Authentication:** ✅ Valid API key configured
**Test Files:** TSV format with 3 entries (Hello/Hola, World/Mundo, API/API)
**Encoding:** UTF-8 with tab separators (verified via hexdump)

## Notes

- The v3 API appears to create bidirectional glossaries by default (en→es becomes en↔es)
- Existing test glossaries from `deepl-python` SDK all show 2 dictionaries
- Response normalization successfully handles missing root-level language fields
- Integration tests pass because they use mocked responses with populated dictionaries
