# Test Coverage Improvement Plan

**Date**: 2025-10-07
**Current Coverage**: 85.87% statements, 80.49% branches, 89.31% functions

## Coverage Analysis Summary

### Files Needing Improvement

| File | Current Coverage | Priority | Uncovered Lines |
|------|------------------|----------|-----------------|
| `src/cli/commands/translate.ts` | 44.76% | 🔴 **CRITICAL** | 47-134, 203, 207, 230-307, 343 |
| `src/cli/commands/auth.ts` | 77.27% | 🟡 Medium | 39-45 |
| `src/api/deepl-client.ts` | 88.29% | 🟢 Low | 142, 289, 322-368 |
| `src/services/file-translation.ts` | 90.47% | 🟢 Low | 87, 91, 98, 118 |
| `src/services/batch-translation.ts` | 98.21% | ✅ Excellent | 158 |
| `src/storage/cache.ts` | 94.20% | ✅ Excellent | 91-92, 104-105 |
| `src/storage/config.ts` | 91.00% | ✅ Good | 82, 143, 219, 232, 240, 265, 278, 301-302 |

## Priority 1: translate.ts (CLI Command) - 44.76%

**Impact**: High - This is the main entry point for translation operations

### Missing Coverage Areas

#### 1. File Translation (`translateFile()`) - Lines 75-135
**Status**: No unit tests exist

**What's Missing**:
- Single file translation to single language
- Single file translation to multiple languages (comma-separated)
- Passing `--from`, `--formality`, `--preserveCode` options
- Error handling (missing `--output` flag)

**Recommended Tests**:
```typescript
describe('translateFile()', () => {
  it('should throw error if output is not specified');
  it('should translate single file to single language');
  it('should translate file to multiple languages');
  it('should pass source language when specified');
  it('should pass formality when specified');
  it('should pass preserveCode option');
});
```

#### 2. Directory Translation (`translateDirectory()`) - Lines 229-309
**Status**: No unit tests exist

**What's Missing**:
- Directory translation with batch processing
- Progress indicator integration (ora spinners)
- Statistics output formatting
- Handling failed/skipped files
- Passing `--recursive`, `--pattern`, `--concurrency` options
- Error handling and spinner.fail() on errors

**Recommended Tests**:
```typescript
describe('translateDirectory()', () => {
  it('should throw error if output directory is not specified');
  it('should translate directory with progress indicator');
  it('should show failed files in output');
  it('should show skipped files in output');
  it('should pass recursive option');
  it('should pass pattern option');
  it('should create new batch service with custom concurrency');
  it('should handle translation errors and fail spinner');
});
```

#### 3. File/Directory Detection (`translate()`) - Lines 47-57
**Status**: Partially tested

**What's Missing**:
- Testing directory detection (fs.statSync().isDirectory())
- Testing file path detection
- Integration with translateFile() and translateDirectory()

**Recommended Tests**:
```typescript
describe('translate() - routing', () => {
  it('should detect and route to translateDirectory()');
  it('should detect and route to translateFile()');
  it('should route to translateText() for plain text');
});
```

## Priority 2: auth.ts (CLI Command) - 77.27%

**Impact**: Medium - Authentication edge cases

### Missing Coverage Areas

#### Lines 39-45 (Error Handling)
**What's Missing**:
- API key validation errors
- Config save failures
- Environment variable fallback logic

**Recommended Tests**:
```typescript
it('should handle API validation failures gracefully');
it('should handle config save errors');
it('should fallback to environment variable when config fails');
```

## Priority 3: deepl-client.ts (API Client) - 88.29%

**Impact**: Low - Most critical paths covered

### Missing Coverage Areas

#### Lines 142, 289, 322-368 (Error Handling)
**What's Missing**:
- Specific error response formats
- Edge cases in retry logic
- Timeout scenarios

**Recommended Tests**:
```typescript
it('should handle malformed API responses');
it('should respect timeout configuration');
it('should handle specific DeepL error codes');
```

## Coverage Goals

### Short Term (Next Session)
- **Target**: 90%+ statement coverage
- **Focus**: Complete `translate.ts` test coverage (Priority 1)
- **Estimated Effort**: 2-3 hours
- **Expected Improvement**: +10-15% overall coverage

### Medium Term
- **Target**: 95%+ statement coverage
- **Focus**: Complete auth.ts and edge cases
- **Estimated Effort**: 1-2 hours
- **Expected Improvement**: +5% overall coverage

### Long Term
- **Target**: 98%+ statement coverage with 90%+ branch coverage
- **Focus**: All edge cases and error paths
- **Note**: 100% coverage not realistic (some code paths are defensive/unreachable)

## Implementation Strategy

### Phase 1: Add File Translation Tests (Highest ROI)
**Files**: `tests/unit/translate-command.test.ts`

```typescript
// Add new describe blocks:
describe('translate() - file/directory detection', () => {
  // 3 tests for routing logic
});

describe('translateFile()', () => {
  // 6 tests for file translation
});

describe('translateDirectory()', () => {
  // 8 tests for batch translation CLI integration
});
```

**Challenges**:
- Need to mock `ora` spinner correctly (ESM module)
- Need to mock `fs.existsSync()` and `fs.statSync()`
- Need to properly mock `BatchTranslationService` behavior

**Expected Coverage Increase**: translate.ts: 44.76% → 85%+

### Phase 2: Add Auth Edge Case Tests
**Files**: `tests/unit/auth-command.test.ts`

```typescript
describe('error handling', () => {
  it('should handle API validation timeout');
  it('should handle config write permission errors');
  it('should gracefully fall back to env var');
});
```

**Expected Coverage Increase**: auth.ts: 77.27% → 90%+

### Phase 3: Add DeepL Client Edge Cases
**Files**: `tests/unit/deepl-client.test.ts`

```typescript
describe('edge cases', () => {
  it('should handle timeout errors specifically');
  it('should handle malformed JSON responses');
  it('should handle unexpected error codes');
});
```

**Expected Coverage Increase**: deepl-client.ts: 88.29% → 95%+

## Testing Best Practices

### When Adding New Tests

1. **Follow TDD Cycle** (even for existing code):
   - RED: Write failing test
   - GREEN: Run tests to verify they pass with existing code
   - REFACTOR: Improve test quality

2. **Mock External Dependencies**:
   - File system (`fs` module)
   - API clients (DeepL)
   - Third-party libraries (ora, p-limit)

3. **Test Behavior, Not Implementation**:
   - Focus on inputs/outputs
   - Don't test internal implementation details
   - Use `jest.spyOn()` sparingly

4. **Keep Tests Isolated**:
   - Each test should be independent
   - Use `beforeEach()` to reset mocks
   - Don't rely on test execution order

5. **Prioritize Coverage Impact**:
   - Focus on files with lowest coverage first
   - Focus on most-used code paths (CLI commands, services)
   - Defer edge cases until main paths are covered

## Notes

- **Integration Tests**: Already have good coverage (27 tests)
- **E2E Tests**: Already have good coverage (21 tests)
- **Unit Tests**: Need improvement in CLI command layer
- **Services**: Excellent coverage (96.42% overall)
- **Storage**: Excellent coverage (92.39% overall)

The main gap is in the **CLI command layer** (translate.ts), which is the user-facing interface. This should be the focus of improvement efforts.

## Measurement

After implementing Phase 1, run:
```bash
npm run test:coverage
```

Expected results:
- Overall coverage: 85.87% → 90%+
- translate.ts: 44.76% → 85%+
- New tests added: ~17 tests
- Total test count: 344 → 361+

---

**Last Updated**: 2025-10-07
**Next Review**: After Phase 1 implementation
