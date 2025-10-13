# v3 Glossary API Research Summary

**Date**: 2025-10-13
**Sources**: DeepL API Documentation, deepl-node SDK

---

## Key Findings

### 1. DeepL's Official Recommendation

**From deepl-node README**:
> "Users are **recommended to utilize these multilingual glossary methods**"
> "The 'v3' endpoints are the newest version, supporting multilingual glossaries"

**From Migration Guide** (`upgrading_to_multilingual_glossaries.md`):
> "encouraged to update to use the new functions"

### 2. v2 Glossary Status

✅ **NOT Deprecated**
- v2 glossaries "remain available"
- Existing v2 methods still work
- No announced deprecation timeline

⚠️ **Discouraged for New Projects**
- DeepL explicitly recommends v3 for new implementations
- Migration guide provided for transitioning
- v3 is the "recommended" path forward

### 3. v3 Capabilities (Verified)

**From DeepL API Documentation**:
- ✅ Supports **single-target** glossaries (pass array with 1 language)
- ✅ Supports **multi-target** glossaries (array with multiple languages)
- ✅ Enhanced editing without recreation (PATCH `/v3/glossaries/{id}`)
- ✅ Dictionary-level operations (`PUT /v3/glossaries/{id}/dictionaries`)
- ✅ More flexible management

**v3 Endpoints Confirmed**:
1. `POST /v3/glossaries` - Create (single or multi-target)
2. `GET /v3/glossaries` - List all
3. `GET /v3/glossaries/{id}` - Get metadata
4. `GET /v3/glossaries/{id}/entries?source_lang=X&target_lang=Y` - Get entries for pair
5. `PUT /v3/glossaries/{id}/dictionaries` - Replace/update dictionary for pair
6. `PATCH /v3/glossaries/{id}` - Update metadata (rename)
7. `DELETE /v3/glossaries/{id}/dictionaries?source_lang=X&target_lang=Y` - Delete pair
8. `DELETE /v3/glossaries/{id}` - Delete glossary

### 4. Single Target Support in v3

**CRITICAL FINDING**: v3 API **fully supports single-target glossaries**.

From the API documentation and deepl-node implementation:
- Can create v3 glossary with `target_langs: ["es"]` (array with 1 item)
- No minimum target count requirement
- Works identically to v2, but with v3's enhanced editing capabilities

**Implication**: We can always use v3 for new glossaries (both single and multiple targets)

### 5. Why Use v3 for Single Targets?

**Benefits**:
1. **Rename without recreation**: PATCH endpoint preserves glossary ID
2. **Direct entry editing**: PUT endpoint updates entries without delete+recreate
3. **Future-proof**: v3 is the current recommended API
4. **Consistency**: One API for all glossaries (simpler code)
5. **Migration-free**: No need to migrate single-target glossaries later

**Drawbacks**:
- None identified. v3 has same or better functionality for all operations.

### 6. Backward Compatibility

**From Migration Guide**:
- v2 and v3 glossaries can coexist
- Both work with `/v2/translate` endpoint
- v2 methods remain available for existing glossaries
- No forced migration timeline

**Warning from DeepL docs**:
> "Don't mix v2 and v3 endpoints for the same glossary"

- If glossary created with v3, use v3 endpoints
- If glossary created with v2, use v2 endpoints
- Mixing can cause "unexpected results"

### 7. SDK Behavior (deepl-node)

**Methods Provided**:
- `createGlossary()` - v2 (legacy)
- `createMultilingualGlossary()` - v3 (recommended)
- Both methods available simultaneously
- No automatic selection - user chooses explicitly

**Our Differentiation**: We hide version selection (better UX)

---

## Decision Matrix

### Option A: Auto-Select v2/v3 Based on Target Count

```typescript
if (targetLangs.length === 1) {
  return createV2Glossary(...);  // Legacy API
} else {
  return createV3Glossary(...);  // Current API
}
```

**Pros**:
- Maximum backward compatibility
- No v3 usage for simple cases

**Cons**:
- ❌ Creates new v2 glossaries (discouraged by DeepL)
- ❌ Future migration burden if v2 deprecated
- ❌ Two code paths to maintain
- ❌ Inconsistent rename behavior (ID changes for single-target)
- ❌ Goes against DeepL's recommendation

### Option B: Always Use v3 for New Glossaries (RECOMMENDED)

```typescript
// Always use v3 (supports both single and multiple targets)
return createV3Glossary(...);
```

**Pros**:
- ✅ Follows DeepL's official recommendation
- ✅ Future-proof (using current API)
- ✅ No new v2 glossaries to migrate later
- ✅ Simpler code (one creation path)
- ✅ Better rename behavior (ID preserved)
- ✅ Consistent editing capabilities
- ✅ v3 handles single targets natively

**Cons**:
- None significant. v3 is 7+ months old and stable.

---

## Recommendation: Always Use v3

### Rationale

1. **DeepL's Guidance**: They explicitly recommend v3 for new implementations
2. **No Downside**: v3 handles single targets as well as v2
3. **Better Features**: Enhanced editing, preserved IDs on rename
4. **Future-Proof**: Reduces migration burden if v2 deprecated
5. **Simpler Code**: One code path instead of two
6. **User Transparency**: Still version-agnostic from user perspective

### Implementation Changes

**Minimal change to original plan**:

```typescript
// Before (original plan):
async createGlossary(name, sourceLang, targetLangs, entries) {
  if (targetLangs.length === 1) {
    return this.createV2Glossary(...);  // ❌ Remove this branch
  } else {
    return this.createV3Glossary(...);
  }
}

// After (future-proof):
async createGlossary(name, sourceLang, targetLangs, entries) {
  // Always use v3 (supports single and multiple targets)
  return this.createV3Glossary(...);  // ✅ One path
}
```

**v2 Support**: Keep for reading existing glossaries only

```typescript
// v2 methods: Read-only for legacy glossaries
async getGlossary(glossaryId) {
  try {
    return await this.getV3Glossary(glossaryId);  // Try v3 first
  } catch (error) {
    if (error.response?.status === 404) {
      return await this.getV2Glossary(glossaryId);  // Fall back to v2
    }
    throw error;
  }
}
```

### User Experience (Unchanged)

Users still don't see or care about versions:

```bash
# Single target - uses v3 internally (NEW: better rename, editing)
deepl glossary create "Terms" --from en --to es --entries "API:API"

# Multiple targets - uses v3 internally (NEW: multilingual support)
deepl glossary create "Terms" --from en --to es,fr,de --entries "API:API"

# Everything works transparently
deepl glossary rename "Terms" "Better Name"  # ID preserved (v3 benefit)
```

---

## Migration Path for Existing v2 Glossaries

### Lazy Migration Strategy

Don't force immediate migration, but provide tools when needed:

```bash
# Optional command for future (if v2 deprecation announced)
deepl glossary migrate <name-or-id>

# Lists glossaries that could benefit from migration
deepl glossary list --legacy  # Shows v2 glossaries (hidden flag)
```

### When to Migrate

Users should migrate v2 → v3 when:
1. They want ID-preserving renames
2. They want to add more language pairs to existing glossary
3. DeepL announces v2 deprecation (if ever)

Migration is **optional** until/unless DeepL deprecates v2.

---

## Summary

### What Changes in Implementation Plan

**Original Plan**: Auto-select v2 for single target, v3 for multiple
**Updated Plan**: Always use v3 for creation, support v2 for reading

**Code Change**: Remove one `if` branch (simpler!)

**Time Impact**: Saves ~30 minutes (less code to write)

**Test Impact**: Fewer test cases needed (one creation path, not two)

### Confidence Level

🟢 **HIGH CONFIDENCE**

- DeepL explicitly recommends v3
- v3 handles single targets natively
- No known downsides to using v3
- Simplifies our codebase
- Future-proofs against potential v2 deprecation

---

**Last Updated**: 2025-10-13
**Verified Against**: DeepL API docs, deepl-node SDK v1.14.0+
