# v3 Glossary API Implementation Plan

**Feature**: Multilingual Glossary Support (v3 API Only)
**Status**: 🚧 Planning Phase
**Estimated Time**: 6-10 hours (1 dev day) - Simplified from original 9-14h
**Target Version**: v0.5.0
**Priority**: HIGH (Feature parity with official SDKs)
**Architecture**: v3-only (no v2 support - CLI not yet in production)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Design Principles](#2-design-principles)
3. [API Version Abstraction Strategy](#3-api-version-abstraction-strategy)
4. [Type System](#4-type-system)
5. [API Client Implementation](#5-api-client-implementation)
6. [Service Layer Implementation](#6-service-layer-implementation)
7. [CLI Commands (User-Facing)](#7-cli-commands-user-facing)
8. [Testing Strategy](#8-testing-strategy)
9. [Implementation Steps (TDD)](#9-implementation-steps-tdd)
10. [Work Estimate](#10-work-estimate)
11. [Migration Guide](#11-migration-guide)
12. [Edge Cases and Error Handling](#12-edge-cases-and-error-handling)

---

## 1. Overview

### Goal

Implement DeepL API v3 glossary endpoints exclusively. Since the CLI is not yet in production, we'll use **v3 only** for all glossary operations - no v2 support needed.

### Key Simplifications (vs Original Plan)

- ✅ **v3-only**: No v2/v3 abstraction layer needed
- ✅ **Simpler code**: One API version, one code path
- ✅ **Faster implementation**: ~40% less code to write
- ✅ **Easier testing**: Fewer test cases, no version compatibility tests
- ✅ **Future-proof**: Using DeepL's current recommended API

### Key Features

- **Multilingual glossaries**: One glossary with multiple language pairs (en→es,fr,de,ja)
- **Single-target support**: v3 handles single targets natively (no v2 needed)
- **Enhanced editing**: PATCH endpoints for rename (ID preserved), PUT for entry updates
- **Clean architecture**: No version detection or fallback logic

### User Experience

```bash
# Single target - uses v3 (simple case)
deepl glossary create "Tech Terms" --from en --to es --entries "API:API,SDK:SDK"

# Multiple targets - uses v3 (multilingual case)
deepl glossary create "Tech Terms" --from en --to es,fr,de --entries "API:API,SDK:SDK"

# User doesn't need to know about v3 - just works!
```

---

## 2. Design Principles

### Principle 1: v3-Only Architecture

**Simple, clean, modern**

- All glossary operations use v3 API exclusively
- No version detection, selection, or fallback logic
- No legacy code paths
- Users never see version mentioned anywhere

### Principle 2: Smart Defaults

**Make common cases simple, complex cases possible**

```bash
# Single target: Simple, no extra flags needed
deepl glossary create "Terms" --from en --to es --entries "API:API"

# Multiple targets: Just add more languages
deepl glossary create "Terms" --from en --to es,fr,de --entries "API:API"

# Operations on multilingual glossaries: --target flag when needed
deepl glossary entries "Terms" --target es
```

### Principle 3: Helpful Errors

**When --target is needed, explain why and how**

- Detect when glossary has multiple language pairs
- Provide clear error with available options
- Show example command with correct syntax

### Principle 4: Clean Implementation

**No version complexity**

- One GlossaryInfo type (v3 structure)
- One set of API methods (v3 endpoints)
- One code path for each operation
- Easier to maintain and extend

---

## 3. Simplified v3-Only Strategy

### No Version Abstraction Needed!

Since we're v3-only, the code is dramatically simpler:

```typescript
/**
 * Create glossary - ALWAYS uses v3
 * Supports both single and multiple targets
 */
async createGlossary(
  name: string,
  sourceLang: Language,
  targetLangs: Language[],
  entries: Record<string, string>
): Promise<GlossaryInfo> {
  // v3 handles both single and multiple targets
  return this.createV3Glossary(name, sourceLang, targetLangs, entries);
}
```

### Smart --target Flag Detection

```typescript
/**
 * Get entries: require --target only when glossary has multiple pairs
 */
async getGlossaryEntries(
  glossaryId: string,
  targetLang?: Language
): Promise<Record<string, string>> {
  const glossary = await this.getGlossary(glossaryId);

  // If glossary has multiple targets and no --target specified
  if (glossary.target_langs.length > 1 && !targetLang) {
    throw new Error(
      `This glossary contains multiple language pairs: ${glossary.target_langs.join(', ')}\n` +
      `Please specify which pair to view:\n` +
      `  deepl glossary entries "${glossary.name}" --target ${glossary.target_langs[0]}`
    );
  }

  // Get target (either specified or the only one available)
  const target = targetLang || glossary.target_langs[0];

  return this.getV3GlossaryEntries(glossaryId, glossary.source_lang, target);
}
```

### No Version Detection Code

**What we DON'T need**:
- ❌ `isV2Glossary()` type guard
- ❌ `detectGlossaryVersion()` function
- ❌ v2 fallback logic
- ❌ Version compatibility checks
- ❌ V2GlossaryInfo vs V3GlossaryInfo union types

**What we DO need**:
- ✅ Single `GlossaryInfo` type (v3 structure)
- ✅ Helper: Check if multiple targets exist
- ✅ Helper: Get target (specified or default)

---

## 4. Simplified Type System (v3-Only)

### Clean, Simple Types

```typescript
// src/types/glossary.ts

/**
 * Glossary Info (v3 API structure)
 * Supports both single and multiple target languages
 */
export interface GlossaryInfo {
  glossary_id: string;
  name: string;
  source_lang: Language;
  target_langs: Language[];  // Always array (even for single target)
  dictionaries: LanguagePairInfo[];
  creation_time: string;
}

/**
 * Language pair within glossary
 */
export interface LanguagePairInfo {
  source_lang: Language;
  target_lang: Language;
  entry_count: number;
}

/**
 * Helper: Check if glossary has multiple language pairs
 */
export function isMultilingual(glossary: GlossaryInfo): boolean {
  return glossary.target_langs.length > 1;
}

/**
 * Helper: Get total entry count across all dictionaries
 */
export function getTotalEntryCount(glossary: GlossaryInfo): number {
  return glossary.dictionaries.reduce((sum, dict) => sum + dict.entry_count, 0);
}

/**
 * Helper: Get target language (specified or default to first)
 */
export function getTargetLang(
  glossary: GlossaryInfo,
  targetLang?: Language
): Language {
  // If specified, validate it exists
  if (targetLang) {
    if (!glossary.target_langs.includes(targetLang)) {
      throw new Error(
        `Target language "${targetLang}" not found in glossary.\n` +
        `Available: ${glossary.target_langs.join(', ')}`
      );
    }
    return targetLang;
  }

  // Otherwise, must be single-target glossary
  if (glossary.target_langs.length !== 1) {
    throw new Error(
      `This glossary contains multiple language pairs: ${glossary.target_langs.join(', ')}\n` +
      `Please specify which pair using --target flag`
    );
  }

  return glossary.target_langs[0];
}
```

**No v2 types needed!** Much simpler.

---

## 5. API Client Implementation

### New v3 Endpoints

```typescript
// src/api/deepl-client.ts

export class DeepLClient {
  // Existing v2 methods (keep unchanged for backward compatibility)
  private async createV2Glossary(...): Promise<V2GlossaryInfo> { /* existing */ }
  private async getV2GlossaryEntries(...): Promise<Record<string, string>> { /* existing */ }

  // New v3 methods (private - not exposed to users)

  /**
   * Create multilingual glossary (v3 API)
   * INTERNAL ONLY - called by public createGlossary()
   */
  private async createV3Glossary(
    name: string,
    sourceLang: Language,
    targetLangs: Language[],
    entries: Record<string, string>
  ): Promise<V3GlossaryInfo> {
    // Build entries TSV for each target language
    const entriesFormat = 'tsv';
    const entriesTsv = Object.entries(entries)
      .map(([source, target]) => `${source}\t${target}`)
      .join('\n');

    const response = await this.axios.post('/v3/glossaries', {
      name,
      source_lang: sourceLang,
      target_langs: targetLangs,
      entries_format: entriesFormat,
      entries: entriesTsv,
    });

    return response.data;
  }

  /**
   * Get entries for specific language pair in v3 glossary
   * INTERNAL ONLY - called by public getGlossaryEntries()
   */
  private async getV3GlossaryEntries(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language
  ): Promise<Record<string, string>> {
    const response = await this.axios.get(
      `/v3/glossaries/${glossaryId}/entries`,
      {
        params: {
          source_lang: sourceLang,
          target_lang: targetLang,
        },
      }
    );

    // Parse TSV response
    const entries: Record<string, string> = {};
    const lines = response.data.trim().split('\n');
    for (const line of lines) {
      const [source, target] = line.split('\t');
      if (source && target) {
        entries[source] = target;
      }
    }

    return entries;
  }

  /**
   * Update/replace dictionary for specific language pair (v3 API)
   * INTERNAL ONLY - called by public addEntry(), updateEntry(), etc.
   */
  private async updateV3GlossaryDictionary(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language,
    entries: Record<string, string>
  ): Promise<void> {
    const entriesTsv = Object.entries(entries)
      .map(([source, target]) => `${source}\t${target}`)
      .join('\n');

    await this.axios.put(
      `/v3/glossaries/${glossaryId}/dictionaries`,
      {
        source_lang: sourceLang,
        target_lang: targetLang,
        entries_format: 'tsv',
        entries: entriesTsv,
      }
    );
  }

  /**
   * Delete specific language pair from v3 glossary
   * INTERNAL ONLY - called by public deleteGlossary() for v3 glossaries
   */
  private async deleteV3GlossaryDictionary(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language
  ): Promise<void> {
    await this.axios.delete(
      `/v3/glossaries/${glossaryId}/dictionaries`,
      {
        params: {
          source_lang: sourceLang,
          target_lang: targetLang,
        },
      }
    );
  }

  /**
   * Rename v3 glossary (PATCH metadata)
   * INTERNAL ONLY - called by public renameGlossary() for v3 glossaries
   */
  private async renameV3Glossary(
    glossaryId: string,
    newName: string
  ): Promise<void> {
    await this.axios.patch(`/v3/glossaries/${glossaryId}`, {
      name: newName,
    });
  }

  // Public API: Version-agnostic methods

  /**
   * Create glossary (automatically selects v2 or v3)
   * PUBLIC API - exposed to GlossaryService
   */
  async createGlossary(
    name: string,
    sourceLang: Language,
    targetLangs: Language[],
    entries: Record<string, string>
  ): Promise<GlossaryInfo> {
    if (targetLangs.length === 1) {
      return this.createV2Glossary(name, sourceLang, targetLangs[0], entries);
    } else {
      return this.createV3Glossary(name, sourceLang, targetLangs, entries);
    }
  }

  /**
   * Get glossary metadata (works for both v2 and v3)
   * PUBLIC API - exposed to GlossaryService
   */
  async getGlossary(glossaryId: string): Promise<GlossaryInfo> {
    // Try v3 first (it's the newer API)
    try {
      const response = await this.axios.get(`/v3/glossaries/${glossaryId}`);
      return response.data as V3GlossaryInfo;
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Try v2
        const response = await this.axios.get(`/v2/glossaries/${glossaryId}`);
        return response.data as V2GlossaryInfo;
      }
      throw error;
    }
  }

  /**
   * Get glossary entries (automatically detects v2 vs v3)
   * PUBLIC API - exposed to GlossaryService
   *
   * For v3 glossaries, targetLang is required
   * For v2 glossaries, targetLang is ignored
   */
  async getGlossaryEntries(
    glossaryId: string,
    targetLang?: Language
  ): Promise<Record<string, string>> {
    const glossary = await this.getGlossary(glossaryId);

    if (isV3Glossary(glossary)) {
      if (!targetLang) {
        throw new Error(
          `This glossary contains multiple language pairs. ` +
          `Please specify target language: ${glossary.target_langs.join(', ')}`
        );
      }
      return this.getV3GlossaryEntries(glossaryId, glossary.source_lang, targetLang);
    } else {
      return this.getV2GlossaryEntries(glossaryId);
    }
  }
}
```

---

## 6. Service Layer Implementation

### GlossaryService Updates

```typescript
// src/services/glossary.ts

export class GlossaryService {
  /**
   * Create glossary (version-agnostic)
   * Automatically selects v2 or v3 based on target count
   */
  async createGlossary(
    name: string,
    sourceLang: Language,
    targetLangs: Language[],
    entries: Record<string, string>
  ): Promise<GlossaryInfo> {
    // Validation
    if (targetLangs.length === 0) {
      throw new Error('At least one target language is required');
    }

    // Delegate to client (which handles v2/v3 selection)
    return this.client.createGlossary(name, sourceLang, targetLangs, entries);
  }

  /**
   * Add entry to glossary (version-agnostic)
   * Works for both v2 and v3 glossaries
   */
  async addEntry(
    glossaryId: string,
    sourceText: string,
    targetText: string,
    targetLang?: Language
  ): Promise<void> {
    const glossary = await this.client.getGlossary(glossaryId);

    if (isV3Glossary(glossary)) {
      // v3: Add to specific language pair
      if (!targetLang) {
        throw new Error(
          `This glossary contains multiple language pairs: ${glossary.target_langs.join(', ')}\n` +
          `Please specify which pair to add to with --target flag`
        );
      }

      // Fetch existing entries for this pair
      const existing = await this.client.getGlossaryEntries(glossaryId, targetLang);

      // Add new entry
      existing[sourceText] = targetText;

      // Update via v3 API
      await this.client.updateV3GlossaryDictionary(
        glossaryId,
        glossary.source_lang,
        targetLang,
        existing
      );
    } else {
      // v2: Use delete+recreate pattern (existing behavior)
      const existing = await this.client.getGlossaryEntries(glossaryId);
      existing[sourceText] = targetText;

      // Delete and recreate
      await this.client.deleteGlossary(glossaryId);
      await this.client.createGlossary(
        glossary.name,
        glossary.source_lang,
        [glossary.target_lang],
        existing
      );
    }
  }

  /**
   * Rename glossary (version-agnostic)
   * v2: delete+recreate, v3: PATCH metadata
   */
  async renameGlossary(
    glossaryId: string,
    newName: string
  ): Promise<GlossaryInfo> {
    const glossary = await this.client.getGlossary(glossaryId);

    if (isV3Glossary(glossary)) {
      // v3: Use PATCH endpoint (efficient!)
      await this.client.renameV3Glossary(glossaryId, newName);

      // Return updated glossary
      return this.client.getGlossary(glossaryId);
    } else {
      // v2: Use delete+recreate pattern (existing behavior)
      const entries = await this.client.getGlossaryEntries(glossaryId);
      await this.client.deleteGlossary(glossaryId);

      return this.client.createGlossary(
        newName,
        glossary.source_lang,
        [glossary.target_lang],
        entries
      );
    }
  }

  /**
   * Get formatted glossary info (version-agnostic)
   * Returns human-readable string for CLI display
   */
  formatGlossaryInfo(glossary: GlossaryInfo): string {
    const lines: string[] = [];

    lines.push(`ID: ${glossary.glossary_id}`);
    lines.push(`Name: ${glossary.name}`);
    lines.push(`Source: ${glossary.source_lang}`);

    if (isV3Glossary(glossary)) {
      // v3: Show all target languages
      lines.push(`Targets: ${glossary.target_langs.join(', ')}`);
      lines.push(`Language Pairs: ${glossary.dictionaries.length}`);

      // Show entry count per pair
      for (const dict of glossary.dictionaries) {
        lines.push(`  ${dict.source_lang} → ${dict.target_lang}: ${dict.entry_count} entries`);
      }
    } else {
      // v2: Show single target
      lines.push(`Target: ${glossary.target_lang}`);
      lines.push(`Entries: ${glossary.entry_count}`);
    }

    lines.push(`Created: ${new Date(glossary.creation_time).toLocaleString()}`);

    return lines.join('\n');
  }
}
```

---

## 7. CLI Commands (User-Facing)

### Command Syntax (No Version Mentioned!)

All commands work identically for v2 and v3 glossaries. Version is invisible to users.

#### Create Glossary

```bash
# Single target (uses v2 internally)
deepl glossary create "My Glossary" --from en --to es --entries "hello:hola,world:mundo"

# Multiple targets (uses v3 internally)
deepl glossary create "My Glossary" --from en --to es,fr,de --entries "hello:hola,world:mundo"

# From file (version auto-detected based on target count)
deepl glossary create "My Glossary" --from en --to es,fr --file terms.csv
```

#### List Glossaries

```bash
# Lists all glossaries (both v2 and v3)
deepl glossary list

# Output shows target languages without version:
# ID: abc123
# Name: Tech Terms
# Source: en
# Targets: es, fr, de  ← Multiple targets indicate v3 (but we don't say that)
# Entries: 150

# ID: def456
# Name: Old Glossary
# Source: en
# Target: es  ← Single target indicates v2 (but we don't say that)
# Entries: 50
```

#### Show Glossary Details

```bash
# Works for both v2 and v3
deepl glossary show "My Glossary"

# v3 output (automatically formatted):
# ID: abc123
# Name: My Glossary
# Source: en
# Targets: es, fr, de
# Language Pairs: 3
#   en → es: 50 entries
#   en → fr: 50 entries
#   en → de: 50 entries
# Created: 2025-10-13 10:30:00

# v2 output (existing format):
# ID: def456
# Name: Old Glossary
# Source: en
# Target: es
# Entries: 50
# Created: 2025-10-13 10:30:00
```

#### Get Entries

```bash
# v2 glossary (single target, no --target needed)
deepl glossary entries "Old Glossary"
# Shows all entries (only one language pair)

# v3 glossary (multiple targets, --target required)
deepl glossary entries "My Glossary" --target es
# Shows entries for en → es pair

# v3 without --target (helpful error)
deepl glossary entries "My Glossary"
# Error: This glossary contains multiple language pairs: es, fr, de
#        Please specify which pair to view:
#          deepl glossary entries "My Glossary" --target es
```

#### Add Entry

```bash
# v2 glossary (uses delete+recreate pattern)
deepl glossary add-entry "Old Glossary" "new:nuevo"

# v3 glossary (requires --target, uses v3 PATCH)
deepl glossary add-entry "My Glossary" "new:nuevo" --target es
# Only updates en → es pair, leaves fr and de unchanged

# v3 without --target (helpful error)
deepl glossary add-entry "My Glossary" "new:nuevo"
# Error: This glossary contains multiple language pairs: es, fr, de
#        Please specify which pair to add to:
#          deepl glossary add-entry "My Glossary" "new:nuevo" --target es
```

#### Update Entry

```bash
# v2 glossary
deepl glossary update-entry "Old Glossary" "hello" "nuevo-hola"

# v3 glossary (requires --target)
deepl glossary update-entry "My Glossary" "hello" "nuevo-hola" --target es
```

#### Remove Entry

```bash
# v2 glossary
deepl glossary remove-entry "Old Glossary" "hello"

# v3 glossary (requires --target)
deepl glossary remove-entry "My Glossary" "hello" --target es
```

#### Rename Glossary

```bash
# Works for both v2 and v3
deepl glossary rename "My Glossary" "Better Name"

# v2: Uses delete+recreate (ID changes)
# v3: Uses PATCH endpoint (ID preserved!)
# User doesn't see the difference in behavior
```

#### Delete Glossary

```bash
# Works for both v2 and v3
deepl glossary delete "My Glossary"

# v2: Deletes single glossary
# v3: Deletes all language pairs in glossary
```

### CLI Implementation

```typescript
// src/cli/commands/glossary.ts

export class GlossaryCommand {
  /**
   * Create glossary
   * Automatically uses v2 or v3 based on target count
   */
  async create(
    name: string,
    options: {
      from: Language;
      to: string;  // Comma-separated list
      entries?: string;
      file?: string;
    }
  ): Promise<void> {
    // Parse target languages (comma-separated)
    const targetLangs = options.to.split(',').map(lang => lang.trim()) as Language[];

    // Parse entries
    const entries = options.file
      ? await this.parseEntriesFromFile(options.file)
      : this.parseEntriesFromString(options.entries || '');

    // Create (GlossaryService handles v2/v3 selection)
    const glossary = await this.glossaryService.createGlossary(
      name,
      options.from,
      targetLangs,
      entries
    );

    // Display result (no mention of version)
    if (targetLangs.length > 1) {
      Logger.success(`Created glossary "${name}" with ${targetLangs.length} language pairs`);
    } else {
      Logger.success(`Created glossary "${name}"`);
    }

    Logger.info(`ID: ${glossary.glossary_id}`);
  }

  /**
   * Add entry to glossary
   * Handles v2/v3 automatically
   */
  async addEntry(
    nameOrId: string,
    entry: string,
    options: { target?: Language }
  ): Promise<void> {
    // Parse entry (source:target format)
    const [source, target] = entry.split(':');
    if (!source || !target) {
      throw new Error('Entry must be in format "source:target"');
    }

    // Get glossary (to detect version)
    const glossary = await this.glossaryService.getGlossaryByName(nameOrId)
      || await this.glossaryService.getGlossaryById(nameOrId);

    if (!glossary) {
      throw new Error(`Glossary "${nameOrId}" not found`);
    }

    // Check if --target is required (v3 with multiple pairs)
    if (isV3Glossary(glossary) && glossary.target_langs.length > 1) {
      if (!options.target) {
        throw new Error(
          `This glossary contains multiple language pairs: ${glossary.target_langs.join(', ')}\n` +
          `Please specify which pair to add to:\n` +
          `  deepl glossary add-entry "${nameOrId}" "${entry}" --target ${glossary.target_langs[0]}`
        );
      }

      // Validate target lang is in glossary
      if (!glossary.target_langs.includes(options.target)) {
        throw new Error(
          `Target language "${options.target}" not found in glossary.\n` +
          `Available: ${glossary.target_langs.join(', ')}`
        );
      }
    }

    // Add entry (service handles v2/v3 logic)
    await this.glossaryService.addEntry(
      glossary.glossary_id,
      source,
      target,
      options.target
    );

    Logger.success(`Added entry to glossary "${glossary.name}"`);
  }

  /**
   * Get entries from glossary
   * Handles v2/v3 automatically
   */
  async getEntries(
    nameOrId: string,
    options: { target?: Language }
  ): Promise<void> {
    // Get glossary
    const glossary = await this.glossaryService.getGlossaryByName(nameOrId)
      || await this.glossaryService.getGlossaryById(nameOrId);

    if (!glossary) {
      throw new Error(`Glossary "${nameOrId}" not found`);
    }

    // Check if --target is required
    if (isV3Glossary(glossary) && glossary.target_langs.length > 1 && !options.target) {
      throw new Error(
        `This glossary contains multiple language pairs: ${glossary.target_langs.join(', ')}\n` +
        `Please specify which pair to view:\n` +
        `  deepl glossary entries "${nameOrId}" --target ${glossary.target_langs[0]}`
      );
    }

    // Get entries
    const entries = await this.glossaryService.getGlossaryEntries(
      glossary.glossary_id,
      options.target
    );

    // Display
    if (isV3Glossary(glossary) && options.target) {
      Logger.info(`Entries for ${glossary.source_lang} → ${options.target}:\n`);
    } else {
      Logger.info(`Entries:\n`);
    }

    for (const [source, target] of Object.entries(entries)) {
      console.log(`${source} → ${target}`);
    }
  }
}
```

---

## 8. Testing Strategy

### Test Coverage Targets

- **Unit Tests**: 50-60 tests
  - DeepL client v3 methods: 20-25 tests
  - GlossaryService v3 logic: 15-20 tests
  - GlossaryCommand v3 handling: 10-15 tests
  - Type guards and helpers: 5 tests

- **Integration Tests**: 20-25 tests
  - CLI glossary create with multiple targets
  - CLI glossary operations on v3 glossaries
  - v2/v3 coexistence scenarios
  - Error handling and validation

- **E2E Tests**: 5-8 tests
  - Complete v3 glossary workflow
  - Mixed v2/v3 usage scenarios

### Test Cases

#### Unit Tests: DeepL Client

```typescript
// tests/unit/deepl-client-glossary-v3.test.ts

describe('DeepLClient - v3 Glossary API', () => {
  describe('createV3Glossary', () => {
    it('should create multilingual glossary with multiple targets', async () => {
      // Mock POST /v3/glossaries
      // Verify request includes target_langs array
      // Verify entries_format and entries TSV
    });

    it('should handle entries with special characters', async () => {
      // Test TSV formatting with tabs, newlines, etc.
    });
  });

  describe('getV3GlossaryEntries', () => {
    it('should fetch entries for specific language pair', async () => {
      // Mock GET /v3/glossaries/{id}/entries?source_lang=en&target_lang=es
      // Verify TSV parsing
    });

    it('should parse TSV response correctly', async () => {
      // Test TSV parsing edge cases
    });
  });

  describe('updateV3GlossaryDictionary', () => {
    it('should update dictionary for language pair', async () => {
      // Mock PUT /v3/glossaries/{id}/dictionaries
      // Verify request includes entries in TSV format
    });
  });

  describe('renameV3Glossary', () => {
    it('should rename glossary via PATCH', async () => {
      // Mock PATCH /v3/glossaries/{id}
      // Verify name update
    });
  });

  describe('createGlossary (version-agnostic)', () => {
    it('should use v2 API for single target', async () => {
      // Call createGlossary with 1 target
      // Verify v2 endpoint called
    });

    it('should use v3 API for multiple targets', async () => {
      // Call createGlossary with 3 targets
      // Verify v3 endpoint called
    });
  });

  describe('getGlossary (version detection)', () => {
    it('should fetch v3 glossary when it exists', async () => {
      // Mock v3 endpoint success
      // Verify returns V3GlossaryInfo
    });

    it('should fall back to v2 when v3 returns 404', async () => {
      // Mock v3 404, v2 success
      // Verify returns V2GlossaryInfo
    });
  });
});
```

#### Unit Tests: GlossaryService

```typescript
// tests/unit/glossary-service-v3.test.ts

describe('GlossaryService - v3 Support', () => {
  describe('addEntry', () => {
    it('should use v3 PATCH for multilingual glossaries', async () => {
      // Mock v3 glossary
      // Verify updateV3GlossaryDictionary called
      // Verify only target pair updated
    });

    it('should use delete+recreate for v2 glossaries', async () => {
      // Mock v2 glossary
      // Verify existing behavior unchanged
    });

    it('should require --target for v3 glossaries with multiple pairs', async () => {
      // Mock v3 glossary with 3 targets
      // Call without targetLang
      // Verify error message
    });
  });

  describe('renameGlossary', () => {
    it('should use PATCH for v3 glossaries', async () => {
      // Mock v3 glossary
      // Verify renameV3Glossary called
      // Verify ID preserved
    });

    it('should use delete+recreate for v2 glossaries', async () => {
      // Mock v2 glossary
      // Verify existing behavior unchanged
    });
  });

  describe('formatGlossaryInfo', () => {
    it('should format v3 glossary with multiple targets', async () => {
      // Mock v3 glossary
      // Verify output includes all targets
      // Verify output includes per-pair entry counts
    });

    it('should format v2 glossary with single target', async () => {
      // Mock v2 glossary
      // Verify existing format unchanged
    });
  });
});
```

#### Integration Tests: CLI

```typescript
// tests/integration/cli-glossary-v3.integration.test.ts

describe('Glossary CLI - v3 Integration', () => {
  describe('create command', () => {
    it('should create v3 glossary with multiple targets', async () => {
      // Run: deepl glossary create "Test" --from en --to es,fr,de --entries "hello:hola"
      // Verify v3 glossary created
      // Verify no mention of "v3" in output
    });

    it('should create v2 glossary with single target', async () => {
      // Run: deepl glossary create "Test" --from en --to es --entries "hello:hola"
      // Verify v2 glossary created
      // Verify backward compatibility
    });
  });

  describe('entries command', () => {
    it('should require --target for v3 glossaries with multiple pairs', async () => {
      // Create v3 glossary with 3 targets
      // Run: deepl glossary entries "Test"
      // Verify error message mentions available targets
    });

    it('should work without --target for v2 glossaries', async () => {
      // Create v2 glossary
      // Run: deepl glossary entries "Test"
      // Verify entries displayed
    });

    it('should show entries for specific target in v3 glossary', async () => {
      // Create v3 glossary
      // Run: deepl glossary entries "Test" --target es
      // Verify only es entries shown
    });
  });

  describe('add-entry command', () => {
    it('should add to specific pair in v3 glossary', async () => {
      // Create v3 glossary with es,fr
      // Run: deepl glossary add-entry "Test" "new:nuevo" --target es
      // Verify only es pair updated
      // Verify fr pair unchanged
    });

    it('should validate target lang exists in v3 glossary', async () => {
      // Create v3 glossary with es,fr
      // Run: deepl glossary add-entry "Test" "new:nuevo" --target de
      // Verify error: de not in glossary
    });
  });

  describe('rename command', () => {
    it('should rename v3 glossary and preserve ID', async () => {
      // Create v3 glossary
      // Note original ID
      // Run: deepl glossary rename "Test" "New Name"
      // Verify ID unchanged (v3 PATCH behavior)
    });

    it('should rename v2 glossary (ID changes)', async () => {
      // Create v2 glossary
      // Note original ID
      // Run: deepl glossary rename "Test" "New Name"
      // Verify ID changed (v2 delete+recreate behavior)
      // Note: User doesn't see version mentioned
    });
  });
});
```

---

## 9. Implementation Steps (TDD)

### Phase 1: Type System (1 hour)

```bash
# 1. Add v3 types
cat > src/types/glossary.ts

# 2. Add type guards and helpers
# - isV3Glossary()
# - isV2Glossary()
# - getTargetLanguages()
# - getTotalEntryCount()

# 3. Write unit tests
cat > tests/unit/types/glossary-types.test.ts
npm test -- glossary-types.test.ts
```

### Phase 2: API Client - v3 Endpoints (3-4 hours)

```bash
# 4. Add private v3 methods to DeepLClient
# - createV3Glossary()
# - getV3GlossaryEntries()
# - updateV3GlossaryDictionary()
# - deleteV3GlossaryDictionary()
# - renameV3Glossary()

# 5. Write unit tests for v3 methods
cat > tests/unit/deepl-client-glossary-v3.test.ts
npm test -- deepl-client-glossary-v3.test.ts

# 6. Update public methods for version abstraction
# - createGlossary() - auto-select v2/v3
# - getGlossary() - try v3, fall back to v2
# - getGlossaryEntries() - detect version, route appropriately

# 7. Write tests for version abstraction
npm test -- deepl-client-glossary-v3.test.ts
```

### Phase 3: Service Layer (2-3 hours)

```bash
# 8. Update GlossaryService methods
# - createGlossary() - delegate to client
# - addEntry() - route to v2 or v3 logic
# - updateEntry() - route to v2 or v3 logic
# - removeEntry() - route to v2 or v3 logic
# - renameGlossary() - use PATCH for v3, delete+recreate for v2
# - formatGlossaryInfo() - format both v2 and v3

# 9. Write unit tests
cat > tests/unit/glossary-service-v3.test.ts
npm test -- glossary-service-v3.test.ts
```

### Phase 4: CLI Commands (2-3 hours)

```bash
# 10. Update GlossaryCommand methods
# - create() - parse comma-separated targets
# - getEntries() - require --target for v3 with multiple pairs
# - addEntry() - require --target for v3 with multiple pairs
# - updateEntry() - require --target for v3 with multiple pairs
# - removeEntry() - require --target for v3 with multiple pairs

# 11. Write unit tests
cat > tests/unit/glossary-command-v3.test.ts
npm test -- glossary-command-v3.test.ts

# 12. Update CLI flag definitions
# src/cli/index.ts: Add --target flag to relevant commands
```

### Phase 5: Integration Tests (1-2 hours)

```bash
# 13. Write integration tests
cat > tests/integration/cli-glossary-v3.integration.test.ts

# Test scenarios:
# - Create v3 glossary with multiple targets
# - Create v2 glossary with single target
# - Operations on v3 glossaries require --target
# - Operations on v2 glossaries work without --target
# - Rename v3 vs v2 behavior
# - Error messages are helpful

npm run test:integration
```

### Phase 6: Documentation (1-2 hours)

```bash
# 14. Update README.md
# - Add multilingual glossary examples
# - Update glossary section with --target flag examples
# - No mention of "v2" or "v3"

# 15. Update docs/API.md
# - Document --target flag for glossary commands
# - Add examples for multilingual glossaries
# - Document behavior (no version mentioned)

# 16. Create example script
cat > examples/15-multilingual-glossary.sh
chmod +x examples/15-multilingual-glossary.sh

# 17. Update CHANGELOG.md
# Add to Unreleased section:
# ### Added
# - Multilingual glossary support (create glossaries with multiple target languages)
# - `--target` flag for glossary commands to specify language pair
#
# ### Changed
# - Glossary create command now accepts comma-separated list of target languages
# - Glossary operations automatically detect and use appropriate API version
```

### Phase 7: Manual Testing & Polish (1 hour)

```bash
# 18. Manual testing with real API
npm link
deepl glossary create "Test Multi" --from en --to es,fr,de --entries "hello:hola,world:mundo"
deepl glossary list
deepl glossary show "Test Multi"
deepl glossary entries "Test Multi" --target es
deepl glossary add-entry "Test Multi" "new:nuevo" --target es
deepl glossary rename "Test Multi" "Renamed Multi"
deepl glossary delete "Renamed Multi"

# 19. Test mixed v2/v3 usage
deepl glossary create "Test Single" --from en --to es --entries "hello:hola"
deepl glossary list  # Should show both v2 and v3 glossaries
deepl glossary entries "Test Single"  # Should work without --target

# 20. Verify error messages are helpful
deepl glossary entries "Test Multi"  # Should explain --target needed
deepl glossary add-entry "Test Multi" "x:y" --target de  # Should validate target exists
```

---

## 10. Work Estimate (v3-Only Simplified)

| Phase | Description | Time | Tests | Files |
|-------|-------------|------|-------|-------|
| 1 | Type System (simplified) | 30min | 3 | 1 |
| 2 | API Client - v3 Endpoints | 2-3h | 15 | 1 |
| 3 | Service Layer (simplified) | 1-2h | 12 | 1 |
| 4 | CLI Commands (simplified) | 1-2h | 10 | 2 |
| 5 | Integration Tests | 1h | 15 | 1 |
| 6 | Documentation | 1h | - | 3 |
| 7 | Manual Testing | 30min | - | - |
| **Total** | **Complete v3-Only Implementation** | **7-11h** | **55 tests** | **10 files** |

### Comparison to Original Plan (v2/v3 Hybrid)

| Metric | v2/v3 Hybrid | v3-Only | Savings |
|--------|--------------|---------|---------|
| **Time** | 11-16h | 7-11h | **~40% faster** |
| **Tests** | 90 tests | 55 tests | **35 fewer tests** |
| **Files** | 13 files | 10 files | **3 fewer files** |
| **Complexity** | High (version detection) | Low (single API) | **Much simpler** |

### File Breakdown

**Modified Files**:
1. `src/types/glossary.ts` - Add v3 types
2. `src/api/deepl-client.ts` - Add v3 endpoints, version abstraction
3. `src/services/glossary.ts` - Add v3 logic, version routing
4. `src/cli/commands/glossary.ts` - Update for v3 support
5. `src/cli/index.ts` - Add --target flag definitions
6. `README.md` - Add multilingual examples
7. `docs/API.md` - Document new behavior
8. `CHANGELOG.md` - Document changes

**New Files**:
1. `tests/unit/types/glossary-types.test.ts` - Type guard tests
2. `tests/unit/deepl-client-glossary-v3.test.ts` - v3 API tests
3. `tests/unit/glossary-service-v3.test.ts` - v3 service tests
4. `tests/unit/glossary-command-v3.test.ts` - v3 CLI tests
5. `tests/integration/cli-glossary-v3.integration.test.ts` - v3 integration tests
6. `examples/15-multilingual-glossary.sh` - Usage example

---

## 11. Migration Guide

### For Users with Existing v2 Glossaries

**Good news: Nothing changes!**

- All existing v2 glossaries continue to work exactly as before
- All existing commands work exactly as before
- No action required

**Optional: Migrate to v3 for new glossaries**

If you want to consolidate multiple single-language glossaries into one multilingual glossary:

```bash
# OLD (v2): Multiple glossaries
deepl glossary create "Tech EN-ES" --from en --to es --entries "API:API,SDK:SDK"
deepl glossary create "Tech EN-FR" --from en --to fr --entries "API:API,SDK:SDK"
deepl glossary create "Tech EN-DE" --from en --to de --entries "API:API,SDK:SDK"

# NEW (v3): One multilingual glossary
deepl glossary create "Tech Terms" --from en --to es,fr,de --entries "API:API,SDK:SDK"
```

### Behavioral Changes

#### Rename Operation (invisible to users)

**v2 glossaries** (single target):
- Rename uses delete+recreate pattern
- Glossary ID changes
- Brief downtime during recreation
- Existing behavior (unchanged)

**v3 glossaries** (multiple targets):
- Rename uses PATCH endpoint
- Glossary ID preserved
- Instant update, no downtime
- New improved behavior (automatic)

**User experience**: Both work transparently, users don't see version mentioned.

#### Entry Operations

**v2 glossaries**:
- Operations work on entire glossary
- No --target flag needed (only one target exists)
- Existing behavior (unchanged)

**v3 glossaries**:
- Operations require --target flag if multiple pairs exist
- Updates only affect specified language pair
- Other pairs remain unchanged

---

## 12. Edge Cases and Error Handling

### Edge Case 1: Empty Target List

```bash
deepl glossary create "Test" --from en --to "" --entries "hello:hola"

# Error: At least one target language is required
```

### Edge Case 2: v3 Glossary Operations Without --target

```bash
# Create v3 glossary with 3 targets
deepl glossary create "Multi" --from en --to es,fr,de --entries "hello:hola"

# Try to get entries without --target
deepl glossary entries "Multi"

# Error: This glossary contains multiple language pairs: es, fr, de
#        Please specify which pair to view:
#          deepl glossary entries "Multi" --target es
```

### Edge Case 3: Invalid Target Language in --target Flag

```bash
# v3 glossary has es,fr targets
deepl glossary add-entry "Multi" "new:nuevo" --target de

# Error: Target language "de" not found in glossary.
#        Available: es, fr
```

### Edge Case 4: Single-Target v3 Glossary

```bash
# Create v3 glossary with only 1 target
deepl glossary create "Single" --from en --to es --entries "hello:hola"

# This uses v2 API internally (optimization)
# User doesn't know or care about version
```

### Edge Case 5: TSV Parsing Edge Cases

```typescript
// Handle entries with special characters
const entries = {
  'hello\tworld': 'hola mundo',  // Tab in source text
  'line\nbreak': 'salto de línea',  // Newline in source text
};

// TSV encoding must escape these properly
// Implementation handles this automatically
```

### Edge Case 6: Glossary Not Found (v2 or v3)

```bash
deepl glossary show "Nonexistent"

# Error: Glossary "Nonexistent" not found
# (No mention of trying v2 then v3 - that's implementation detail)
```

### Edge Case 7: API Error During v3 Operation

```typescript
// If v3 API returns error
try {
  await client.createV3Glossary(...);
} catch (error) {
  // Map API error to user-friendly message
  // Don't expose "v3 API failed" - just explain the problem
  throw new Error('Failed to create glossary: ' + getUserFriendlyMessage(error));
}
```

---

## Summary

### Key Design Decisions

1. **Version Transparency**: API version is completely hidden from users
2. **Automatic Selection**: v3 used for multiple targets, v2 for single target
3. **Unified Commands**: Same commands work for both v2 and v3 glossaries
4. **Smart Defaults**: --target flag required only when ambiguous (v3 with multiple pairs)
5. **Helpful Errors**: Error messages explain what to do, never mention "v2" or "v3"

### Implementation Approach

- **TDD**: Write tests first for all new functionality
- **Incremental**: Build layer by layer (types → client → service → CLI)
- **Backward Compatible**: Zero breaking changes for existing users
- **Well Tested**: 90+ new tests covering all v3 functionality

### User Experience

Users get:
- ✅ Multilingual glossary support (create once, use for many languages)
- ✅ Efficient operations (v3 PATCH for rename, no recreate needed)
- ✅ Seamless experience (no version mentioned anywhere)
- ✅ Helpful error messages (explain what's needed, how to fix)
- ✅ Full backward compatibility (existing workflows unchanged)

---

## 13. Summary: Why v3-Only is Better

### Benefits of v3-Only Approach

1. **✅ Simpler Implementation**: ~40% less code, 35 fewer tests
2. **✅ Faster Development**: 7-11 hours vs 11-16 hours
3. **✅ Easier Maintenance**: One API, one code path
4. **✅ Future-Proof**: Using DeepL's current recommended API
5. **✅ Better Features**: ID-preserving renames, direct entry editing
6. **✅ No Technical Debt**: No legacy v2 support to maintain

### What We're NOT Doing

❌ v2 support (not needed - CLI not in production yet)
❌ Version detection/fallback logic
❌ Union types for v2/v3 compatibility
❌ Dual code paths for each operation
❌ Version-specific test cases

### What We ARE Doing

✅ Clean v3-only implementation
✅ Single GlossaryInfo type (v3 structure)
✅ Support single AND multiple targets (v3 handles both)
✅ Smart --target flag (required only when ambiguous)
✅ Simple, maintainable codebase

### Decision Rationale

**User's insight**: "Nobody is using this CLI yet"

This means:
- No backward compatibility burden
- No existing v2 glossaries to support
- Free to use best practices from day 1
- Can follow DeepL's official recommendation

**Result**: Cleaner, faster, better implementation!

---

**Ready to implement! 🚀**

This v3-only approach gives us:
- ⏱️ **7-11 hours** total implementation time
- 📝 **55 tests** (comprehensive coverage)
- 🎯 **10 files** (clean, focused changes)
- 🚀 **Modern architecture** (no legacy baggage)

Would you like me to start with Phase 1 (Type System)?
