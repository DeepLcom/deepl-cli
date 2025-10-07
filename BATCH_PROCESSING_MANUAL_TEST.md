# Batch Processing Manual Test Guide

**Feature**: Batch Translation with Parallel Processing (Phase 2, Feature #2)
**Date**: 2025-10-07
**Version**: 0.2.0-dev

## Prerequisites

1. Install the CLI globally:
   ```bash
   npm run build
   npm link
   ```

2. Configure API key (required for real API calls):
   ```bash
   deepl auth set-key "your-api-key-here"
   ```

3. Create test directory structure:
   ```bash
   mkdir -p /tmp/deepl-batch-test/{docs,blog/{posts,drafts}}
   ```

4. Create test files:
   ```bash
   # Simple text files
   echo "Hello world" > /tmp/deepl-batch-test/file1.txt
   echo "This is a test" > /tmp/deepl-batch-test/file2.txt
   echo "Good morning" > /tmp/deepl-batch-test/file3.txt

   # Markdown files
   echo "# Welcome\nThis is a markdown document." > /tmp/deepl-batch-test/docs/README.md
   echo "# Installation\nFollow these steps." > /tmp/deepl-batch-test/docs/INSTALL.md

   # Blog posts
   echo "# My First Post\nContent here." > /tmp/deepl-batch-test/blog/posts/post1.md
   echo "# Second Post\nMore content." > /tmp/deepl-batch-test/blog/posts/post2.md
   echo "# Draft Post\nWork in progress." > /tmp/deepl-batch-test/blog/drafts/draft1.md

   # Unsupported file (should be skipped)
   echo "Binary data" > /tmp/deepl-batch-test/image.png
   ```

## Test Scenarios

### Scenario 1: Basic Directory Translation (Non-Recursive)

**Objective**: Translate files in a single directory without subdirectories

```bash
deepl translate /tmp/deepl-batch-test --to es --output /tmp/deepl-batch-test-out
```

**Expected Results**:
- ✅ Progress spinner shows "Scanning files..." → "Translating files..." → "Translation complete!"
- ✅ 3 files translated: file1.txt, file2.txt, file3.txt
- ✅ Subdirectories (docs/, blog/) are ignored (non-recursive by default is false)
- ✅ Output files: file1.es.txt, file2.es.txt, file3.es.txt
- ✅ Statistics shown: "3 successful, 0 failed, 1 skipped (image.png)"

**Validation**:
```bash
ls /tmp/deepl-batch-test-out
cat /tmp/deepl-batch-test-out/file1.es.txt  # Should contain Spanish translation
```

---

### Scenario 2: Recursive Directory Translation

**Objective**: Translate all files including subdirectories

```bash
deepl translate /tmp/deepl-batch-test --to es --output /tmp/deepl-batch-test-out-recursive --recursive
```

**Expected Results**:
- ✅ Progress shows scanning nested directories
- ✅ 8 files translated:
  - 3 from root (file1.txt, file2.txt, file3.txt)
  - 2 from docs/ (README.md, INSTALL.md)
  - 3 from blog/ (posts/post1.md, posts/post2.md, drafts/draft1.md)
- ✅ Directory structure preserved in output:
  ```
  /tmp/deepl-batch-test-out-recursive/
  ├── file1.es.txt
  ├── file2.es.txt
  ├── file3.es.txt
  ├── docs/
  │   ├── README.es.md
  │   └── INSTALL.es.md
  └── blog/
      ├── posts/
      │   ├── post1.es.md
      │   └── post2.es.md
      └── drafts/
          └── draft1.es.md
  ```
- ✅ Statistics: "8 successful, 0 failed, 1 skipped"

**Validation**:
```bash
tree /tmp/deepl-batch-test-out-recursive
cat /tmp/deepl-batch-test-out-recursive/blog/posts/post1.es.md
```

---

### Scenario 3: Glob Pattern Filtering

**Objective**: Translate only specific file types

```bash
# Only translate markdown files
deepl translate /tmp/deepl-batch-test --to fr --output /tmp/deepl-batch-test-md --recursive --pattern "**/*.md"
```

**Expected Results**:
- ✅ Only .md files translated (5 files)
- ✅ .txt files skipped or not found
- ✅ Output files: README.fr.md, INSTALL.fr.md, post1.fr.md, post2.fr.md, draft1.fr.md

**Validation**:
```bash
find /tmp/deepl-batch-test-md -name "*.fr.md" | wc -l  # Should be 5
find /tmp/deepl-batch-test-md -name "*.fr.txt" | wc -l  # Should be 0
```

---

### Scenario 4: Multiple Target Languages

**Objective**: Translate to multiple languages in one command

```bash
deepl translate /tmp/deepl-batch-test/file1.txt --to es,fr,de --output /tmp/deepl-batch-test-multi
```

**Expected Results**:
- ✅ 3 output files created:
  - file1.es.txt (Spanish)
  - file1.fr.txt (French)
  - file1.de.txt (German)
- ✅ Progress shows 3 translations
- ✅ Statistics: "3 successful, 0 failed"

**Validation**:
```bash
ls /tmp/deepl-batch-test-multi
cat /tmp/deepl-batch-test-multi/file1.es.txt
cat /tmp/deepl-batch-test-multi/file1.fr.txt
cat /tmp/deepl-batch-test-multi/file1.de.txt
```

---

### Scenario 5: Concurrency Control

**Objective**: Test parallel translation with different concurrency limits

```bash
# Low concurrency (1 = sequential)
time deepl translate /tmp/deepl-batch-test --to es --output /tmp/deepl-batch-test-seq --recursive --concurrency 1

# High concurrency (10 = parallel)
time deepl translate /tmp/deepl-batch-test --to es --output /tmp/deepl-batch-test-par --recursive --concurrency 10
```

**Expected Results**:
- ✅ Sequential run (concurrency 1) takes longer
- ✅ Parallel run (concurrency 10) completes faster
- ✅ Both produce identical results
- ✅ No race conditions or file corruption

**Validation**:
```bash
diff -r /tmp/deepl-batch-test-seq /tmp/deepl-batch-test-par  # Should be identical
```

---

### Scenario 6: Error Handling (Network Failure)

**Objective**: Verify graceful error handling

```bash
# 1. Disconnect from internet or use invalid API key
deepl auth set-key "invalid-key-12345"

# 2. Attempt batch translation
deepl translate /tmp/deepl-batch-test --to es --output /tmp/deepl-batch-test-error --recursive
```

**Expected Results**:
- ✅ Spinner shows progress, but errors occur
- ✅ Error message displayed for each failed file
- ✅ Statistics show failures: "0 successful, 8 failed"
- ✅ CLI doesn't crash or hang
- ✅ Failed files listed with error messages

**Validation**:
```bash
# Check that CLI exited gracefully (not crashed)
echo $?  # Should be non-zero (error exit code)
```

---

### Scenario 7: Progress Indicators

**Objective**: Verify progress feedback during translation

```bash
# Create larger test set
for i in {1..20}; do
  echo "Test file $i" > /tmp/deepl-batch-test/large-test-$i.txt
done

deepl translate /tmp/deepl-batch-test --to es --output /tmp/deepl-batch-test-large --concurrency 3
```

**Expected Results**:
- ✅ Spinner shows "Scanning files..." initially
- ✅ Spinner updates to "Translating files..." with progress
- ✅ Real-time feedback as files complete
- ✅ Final spinner shows "Translation complete!" in green
- ✅ Summary statistics displayed

**Visual Check**:
- Spinner animation is smooth
- Progress updates in real-time
- No flickering or visual glitches

---

### Scenario 8: Cache Behavior

**Objective**: Verify caching works with batch translation

```bash
# First run (cache miss)
time deepl translate /tmp/deepl-batch-test --to es --output /tmp/deepl-batch-test-cache1 --recursive

# Second run (cache hit)
time deepl translate /tmp/deepl-batch-test --to es --output /tmp/deepl-batch-test-cache2 --recursive
```

**Expected Results**:
- ✅ First run takes longer (API calls made)
- ✅ Second run much faster (cache hits)
- ✅ Identical output in both runs
- ✅ Cache stats show hits: `deepl cache stats`

**Validation**:
```bash
diff -r /tmp/deepl-batch-test-cache1 /tmp/deepl-batch-test-cache2
deepl cache stats  # Should show cache hits
```

---

### Scenario 9: Format Preservation

**Objective**: Verify markdown formatting is preserved

```bash
# Create markdown with code blocks and formatting
cat > /tmp/deepl-batch-test/formatted.md << 'EOF'
# Hello World Tutorial

This is a tutorial with `code blocks`.

```javascript
function hello() {
  console.log("Hello");
}
```

Variables like {name} and ${var} should be preserved.
EOF

deepl translate /tmp/deepl-batch-test/formatted.md --to es --output /tmp/deepl-batch-test-fmt --preserve-code
```

**Expected Results**:
- ✅ Code blocks preserved (no translation inside ```)
- ✅ Inline code preserved (`code blocks`)
- ✅ Variables preserved ({name}, ${var})
- ✅ Markdown structure intact (headers, formatting)

**Validation**:
```bash
cat /tmp/deepl-batch-test-fmt/formatted.es.md
# Verify code blocks and variables are unchanged
```

---

### Scenario 10: Edge Cases

#### Empty Directory
```bash
mkdir /tmp/deepl-batch-empty
deepl translate /tmp/deepl-batch-empty --to es --output /tmp/deepl-batch-empty-out
```
**Expected**: "No files found" or "0 successful, 0 failed"

#### Non-Existent Directory
```bash
deepl translate /tmp/deepl-nonexistent --to es --output /tmp/deepl-out
```
**Expected**: Error message: "Directory not found"

#### No Supported Files
```bash
mkdir /tmp/deepl-batch-unsupported
echo "data" > /tmp/deepl-batch-unsupported/file.pdf
echo "data" > /tmp/deepl-batch-unsupported/file.jpg
deepl translate /tmp/deepl-batch-unsupported --to es --output /tmp/deepl-out
```
**Expected**: "0 successful, 0 failed, 2 skipped"

---

## Test Results Template

```markdown
## Manual Test Results - Batch Processing

**Tester**: [Your Name]
**Date**: [YYYY-MM-DD]
**CLI Version**: [Run `deepl --version`]
**Node Version**: [Run `node --version`]
**OS**: [macOS / Linux / Windows]

| Scenario | Status | Notes |
|----------|--------|-------|
| 1. Basic Directory (Non-Recursive) | ☐ Pass ☐ Fail | |
| 2. Recursive Directory | ☐ Pass ☐ Fail | |
| 3. Glob Pattern Filtering | ☐ Pass ☐ Fail | |
| 4. Multiple Target Languages | ☐ Pass ☐ Fail | |
| 5. Concurrency Control | ☐ Pass ☐ Fail | |
| 6. Error Handling | ☐ Pass ☐ Fail | |
| 7. Progress Indicators | ☐ Pass ☐ Fail | |
| 8. Cache Behavior | ☐ Pass ☐ Fail | |
| 9. Format Preservation | ☐ Pass ☐ Fail | |
| 10. Edge Cases | ☐ Pass ☐ Fail | |

**Overall Result**: ☐ PASS ☐ FAIL

**Issues Found**:
- [List any bugs, unexpected behavior, or UX issues]

**Performance Notes**:
- Average translation time: [seconds]
- Cache hit rate: [percentage]
- Concurrency impact: [observations]

**UX Feedback**:
- [Spinner animation quality]
- [Error message clarity]
- [Statistics display usefulness]
```

---

## Cleanup

After testing:

```bash
# Remove test directories
rm -rf /tmp/deepl-batch-test*
rm -rf /tmp/deepl-batch-empty*

# Reset API key if needed
deepl auth clear
```

---

## Notes

- **API Costs**: Be mindful of DeepL API character limits when testing with real API
- **Test Data**: Use small test files to minimize API usage
- **Mock Testing**: Unit tests already cover logic; manual testing focuses on UX and real API behavior
- **Visual Verification**: Check spinner animations and color output in terminal
- **Performance**: Note timing differences between sequential and parallel runs
