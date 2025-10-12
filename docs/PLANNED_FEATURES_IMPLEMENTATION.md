# Planned Features Implementation Plan

**Created**: October 12, 2025
**Status**: In Progress
**Estimated Total Time**: 23-30 hours

This document outlines the implementation plan for all features listed in the "Planned Features" section of docs/API.md.

---

## Priority 1: HIGH - Quick Wins (High Value, Low Complexity)

### 1. `--glossary NAME` flag for translate/watch commands ⭐⭐⭐
**Status**: 🔴 Not Started
**Estimated Time**: 3-4 hours
**Value**: HIGH - Enables glossary usage in translation workflows
**Complexity**: LOW-MEDIUM

**Implementation Plan**:
- **TDD Approach**:
  1. Write tests for translate with --glossary flag
  2. Write tests for watch with --glossary flag
  3. Implement glossary lookup (by name or ID)
  4. Pass glossary_id to translation API
  5. Add integration tests

**Files to modify**:
- `src/cli/index.ts` - Add `--glossary` option to translate and watch commands
- `src/cli/commands/translate.ts` - Handle glossary parameter
- `src/cli/commands/watch.ts` - Handle glossary parameter
- `src/services/translation.ts` - Pass glossary_id to DeepL API
- `tests/unit/translate-command.test.ts` - Add glossary tests
- `tests/integration/cli-translate.integration.test.ts` - Add glossary integration tests

**Implementation Steps**:
1. Add glossary lookup helper (convert name → ID)
2. Add `glossary?: string` to TranslateCommand options
3. Add `glossaryId` to TranslationOptions
4. Update DeepL client to include glossary_id in requests
5. Test with real glossary (integration test)

---

### 2. `--no-cache` flag for single-command cache bypass ⭐⭐⭐
**Status**: 🔴 Not Started
**Estimated Time**: 1-2 hours
**Value**: HIGH - Useful for testing/debugging
**Complexity**: LOW

**Implementation Plan**:
- **TDD Approach**:
  1. Write tests for --no-cache flag
  2. Implement cache bypass in TranslationService
  3. Add CLI option
  4. Verify cache is skipped but not disabled globally

**Files to modify**:
- `src/cli/index.ts` - Add `--no-cache` global option
- `src/services/translation.ts` - Accept `skipCache` parameter
- `src/cli/commands/translate.ts` - Pass skipCache to service
- `tests/unit/translation-service.test.ts` - Add cache bypass tests

**Implementation Steps**:
1. Add `skipCache?: boolean` to TranslationOptions
2. Check skipCache before cache.get()
3. Add global --no-cache option in commander
4. Test that cache is not written when flag is set

---

### 3. `--format json` for translate and write commands ⭐⭐
**Status**: 🔴 Not Started
**Estimated Time**: 2-3 hours
**Value**: HIGH - Enables scripting and automation
**Complexity**: LOW-MEDIUM

**Implementation Plan**:
- **TDD Approach**:
  1. Write tests for JSON output format
  2. Create JSON formatter functions
  3. Add --format option
  4. Test with all command variations

**Files to modify**:
- `src/cli/index.ts` - Add `--format` option to translate and write
- `src/cli/commands/translate.ts` - Format output as JSON
- `src/cli/commands/write.ts` - Format output as JSON
- `src/utils/formatters.ts` (new) - JSON formatting utilities
- `tests/unit/translate-command.test.ts` - Add JSON format tests
- `tests/unit/write-command.test.ts` - Add JSON format tests

**JSON Output Structure**:
```typescript
// Translate output
{
  "text": "Hola",
  "detectedSourceLang": "en",
  "targetLang": "es",
  "cached": false
}

// Write output
{
  "original": "This are good.",
  "improved": "This is good.",
  "changes": 1,
  "language": "en-US"
}
```

---

### 4. `cache enable --max-size SIZE` flag ⭐⭐
**Status**: 🔴 Not Started
**Estimated Time**: 1-2 hours
**Value**: MEDIUM - Convenient for cache configuration
**Complexity**: LOW

**Implementation Plan**:
- **TDD Approach**:
  1. Write tests for cache enable with --max-size
  2. Add option parsing (support bytes and human-readable)
  3. Update config when flag provided
  4. Validate size value

**Files to modify**:
- `src/cli/index.ts` - Add `--max-size` option to cache enable
- `src/cli/commands/cache.ts` - Handle maxSize parameter
- `src/utils/parse-size.ts` (new) - Parse human-readable sizes (100M, 1G)
- `tests/unit/cache-command.test.ts` - Add maxSize tests

**Implementation Steps**:
1. Add optional `--max-size <size>` to cache enable
2. Parse size (support: bytes, KB, MB, GB, K, M, G)
3. Update config.cache.maxSize when provided
4. Validate size is positive integer

---

## Priority 2: MEDIUM - Valuable Features (Medium Complexity)

### 5. `--verbose` flag for detailed logging ⭐⭐
**Status**: 🔴 Not Started
**Estimated Time**: 4-5 hours
**Value**: MEDIUM - Helps debugging and transparency
**Complexity**: MEDIUM

**Implementation Plan**:
- **TDD Approach**:
  1. Write tests for verbose output
  2. Create Logger utility
  3. Add logging throughout application
  4. Test log suppression when flag not set

**Files to modify**:
- `src/utils/logger.ts` (new) - Centralized logging utility
- `src/cli/index.ts` - Add global `--verbose` option
- `src/api/deepl-client.ts` - Log API requests/responses
- `src/services/translation.ts` - Log cache hits/misses
- All CLI commands - Use logger instead of console.log
- `tests/unit/logger.test.ts` (new) - Logger tests

**Logging Details**:
- API request: method, URL, headers (masked), body preview
- API response: status, timing, body preview
- Cache: hits/misses with keys
- File operations: paths, sizes
- Timing: operation duration

---

### 6. `--quiet` flag to suppress output ⭐⭐
**Status**: 🔴 Not Started
**Estimated Time**: 2-3 hours
**Value**: MEDIUM - Useful for scripting
**Complexity**: LOW-MEDIUM

**Implementation Plan**:
- **TDD Approach**:
  1. Write tests for quiet mode
  2. Modify all console.log calls
  3. Only show errors in quiet mode
  4. Test with all commands

**Files to modify**:
- `src/utils/logger.ts` - Add quiet mode support
- `src/cli/index.ts` - Add global `--quiet` option
- All CLI commands - Use logger
- `tests/integration/*.test.ts` - Add quiet mode tests

**Behavior**:
- Suppress all success messages
- Suppress progress indicators
- Show only error messages
- Return only essential output (translation result)

---

## Priority 3: LOW - Nice-to-Have Features

### 7. Granular Exit Codes (2-7) ⭐
**Status**: 🔴 Not Started
**Estimated Time**: 3-4 hours
**Value**: MEDIUM - Better error handling for scripts
**Complexity**: MEDIUM

**Implementation Plan**:
- **TDD Approach**:
  1. Define exit code constants
  2. Write tests for each error type
  3. Update error handling throughout
  4. Test with integration tests

**Exit Code Mapping**:
```typescript
enum ExitCode {
  SUCCESS = 0,
  GENERAL_ERROR = 1,
  AUTH_ERROR = 2,          // Invalid API key, 403
  RATE_LIMIT = 3,          // 429 Too Many Requests
  QUOTA_EXCEEDED = 4,      // 456 Quota exceeded
  NETWORK_ERROR = 5,       // ECONNREFUSED, timeout
  INVALID_INPUT = 6,       // File not found, bad format
  CONFIG_ERROR = 7         // Invalid config, missing settings
}
```

**Files to modify**:
- `src/types/exit-codes.ts` (new) - Exit code enum
- `src/api/deepl-client.ts` - Throw specific error types
- `src/errors/` (new) - Custom error classes
- All CLI commands - Use specific exit codes
- `tests/e2e/*.test.ts` - Verify exit codes

---

### 8. `--preserve-formatting` flag ⭐
**Status**: 🔴 Not Started
**Estimated Time**: 3-4 hours
**Value**: LOW-MEDIUM - Useful for specific content types
**Complexity**: MEDIUM

**Implementation Plan**:
- **TDD Approach**:
  1. Write tests for formatting preservation
  2. Implement whitespace detection
  3. Modify translation flow
  4. Test with various content types

**Files to modify**:
- `src/cli/index.ts` - Add `--preserve-formatting` option
- `src/services/preservation.ts` - Add formatting preservation logic
- `src/services/translation.ts` - Apply formatting preservation
- `tests/unit/preservation.test.ts` - Add formatting tests

**Preservation Logic**:
- Detect leading/trailing whitespace
- Preserve line breaks (single vs double)
- Preserve indentation patterns
- Restore after translation

---

## Implementation Timeline

### Week 1 (Quick Wins - 8-11 hours)
- Day 1-2: `--glossary` flag (3-4 hrs)
- Day 2-3: `--no-cache` flag (1-2 hrs)
- Day 3-4: `--format json` (2-3 hrs)
- Day 4-5: `cache enable --max-size` (1-2 hrs)

### Week 2 (Medium Priority - 9-11 hours)
- Day 1-3: `--verbose` flag (4-5 hrs)
- Day 3-5: `--quiet` flag (2-3 hrs)
- Day 5: Testing and refinement (2-3 hrs)

### Week 3 (Low Priority - 6-8 hours)
- Day 1-2: Granular exit codes (3-4 hrs)
- Day 3-4: `--preserve-formatting` (3-4 hrs)
- Day 5: Final testing, documentation, release

**Total Estimated Time**: 23-30 hours (3 weeks part-time, 1 week full-time)

---

## Benefits of Implementation

✅ **Improved Usability**:
- Glossary integration streamlines translation workflows
- JSON output enables automation and scripting
- Verbose/quiet modes for different use cases

✅ **Better Developer Experience**:
- Verbose mode helps debugging
- Granular exit codes enable robust error handling
- No-cache flag useful for testing

✅ **Feature Completeness**:
- Implements all documented planned features
- Maintains documentation accuracy
- Reduces "coming soon" notes

✅ **Test Coverage**:
- All features developed with TDD
- Comprehensive unit + integration tests
- Maintains >90% code coverage

---

## Documentation Updates Required

For each feature:
1. Move from "Planned Features" to main command documentation in docs/API.md
2. Update examples/ with working scripts
3. Update CHANGELOG.md with new features
4. Update TODO.md completion status
5. Update README.md with usage examples

---

## Progress Tracking

| Feature | Priority | Status | Est. Time | Actual Time | Commits |
|---------|----------|--------|-----------|-------------|---------|
| --glossary | HIGH | 🔴 Not Started | 3-4h | - | - |
| --no-cache | HIGH | 🔴 Not Started | 1-2h | - | - |
| --format json | HIGH | 🔴 Not Started | 2-3h | - | - |
| cache --max-size | HIGH | 🔴 Not Started | 1-2h | - | - |
| --verbose | MEDIUM | 🔴 Not Started | 4-5h | - | - |
| --quiet | MEDIUM | 🔴 Not Started | 2-3h | - | - |
| Exit codes | LOW | 🔴 Not Started | 3-4h | - | - |
| --preserve-formatting | LOW | 🔴 Not Started | 3-4h | - | - |

**Legend**:
- 🔴 Not Started
- 🟡 In Progress
- 🟢 Complete
- ✅ Tested & Documented

---

**Last Updated**: October 12, 2025
