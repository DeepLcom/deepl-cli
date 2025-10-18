# Project-Level Configuration Implementation Plan

**Feature**: `.deepl.toml` project-level configuration
**Status**: 🚧 Planning Phase
**Estimated Time**: 12-16 hours (2 full dev days)
**Difficulty**: Medium
**Risk Level**: Low-Medium
**Value**: High (enables project-specific workflows, team collaboration)

---

## Table of Contents

1. [Architecture Analysis](#1-architecture-analysis)
2. [Technical Requirements](#2-technical-requirements)
3. [Implementation Approach](#3-implementation-approach)
4. [File Structure Changes](#4-file-structure-changes)
5. [Implementation Details](#5-implementation-details)
6. [Backwards Compatibility](#6-backwards-compatibility)
7. [Testing Strategy](#7-testing-strategy)
8. [Work Estimate](#8-work-estimate)
9. [Trade-offs and Decisions](#9-trade-offs-and-decisions)
10. [Security Considerations](#10-security-considerations)
11. [User Experience Enhancements](#11-user-experience-enhancements)
12. [Example Implementation Workflow](#12-example-implementation-workflow)

---

## 1. Architecture Analysis

### Current State

- Global config stored in `~/.deepl-cli/config.json` (managed by `ConfigService`)
- Uses `conf` package for JSON-based configuration
- Single-level config with no project-specific overrides

### Proposed State

**Two-tier configuration system:**

1. **Global config** (`~/.deepl-cli/config.json`) - User preferences, API keys
2. **Project config** (`.deepl.toml` in project root) - Project-specific settings

### Configuration Precedence (highest to lowest)

```
CLI flags > Project config (.deepl.toml) > Global config > Defaults
```

**Example:**
```bash
# If .deepl.toml has target_langs = ["es", "fr"]
# And global config has target_langs = ["de"]
# And CLI flag is --to ja

# Result: Uses "ja" (CLI flag wins)
```

---

## 2. Technical Requirements

### Dependencies to Add

```json
{
  "dependencies": {
    "@iarna/toml": "^2.2.5"
  },
  "devDependencies": {
    "@types/iarna__toml": "^2.0.2"
  }
}
```

**Rationale**: `@iarna/toml` is well-maintained, TypeScript-friendly, and widely used.

**Alternative**: `toml` package (simpler but less maintained)

### New Services Needed

#### `src/storage/project-config.ts` - New service for project-level configuration

```typescript
interface ProjectConfig {
  project?: {
    name?: string;
    version?: string;
  };
  defaults?: {
    source_lang?: Language;
    target_langs?: Language[];
    glossary?: string;
    formality?: string;
    preserve_code?: boolean;
    preserve_formatting?: boolean;
  };
  paths?: {
    source?: string;
    output?: string;
  };
  watch?: {
    enabled?: boolean;
    pattern?: string;
    auto_commit?: boolean;
    debounce?: number;
  };
  batch?: {
    parallel?: number;
  };
}

class ProjectConfigService {
  /**
   * Find .deepl.toml by walking up directory tree
   */
  findProjectConfig(startDir: string): string | null;

  /**
   * Load and parse .deepl.toml
   */
  loadProjectConfig(configPath: string): ProjectConfig;

  /**
   * Validate project config schema
   */
  validateProjectConfig(config: ProjectConfig): void;

  /**
   * Merge project config with global config
   * Project config takes precedence over global config
   */
  mergeConfigs(projectConfig: ProjectConfig, globalConfig: Config): Config;
}
```

### File Discovery Mechanism

```typescript
/**
 * Search for .deepl.toml starting from current directory,
 * walking up to root directory
 */
function findProjectConfig(startDir: string = process.cwd()): string | null {
  let currentDir = startDir;

  while (true) {
    const configPath = path.join(currentDir, '.deepl.toml');

    if (fs.existsSync(configPath)) {
      return configPath;
    }

    const parentDir = path.dirname(currentDir);

    // Reached root directory
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}
```

---

## 3. Implementation Approach

### Phase 1: Core Infrastructure (3-4 hours)

#### Task 1: Add TOML parsing dependency

```bash
npm install @iarna/toml
npm install --save-dev @types/iarna__toml
```

#### Task 2: Create ProjectConfigService

- **File**: `src/storage/project-config.ts`
- **Implement**: `findProjectConfig()`, `loadProjectConfig()`, `validateProjectConfig()`
- Add schema validation with helpful error messages
- **Tests**: Unit tests for parsing, validation, file discovery

#### Task 3: Create types

- **File**: `src/types/project-config.ts`
- Define `ProjectConfig` interface matching TOML structure
- Add Zod schema for runtime validation

### Phase 2: Configuration Merging (2-3 hours)

#### Task 4: Implement config precedence

- Update `ConfigService` to support merging
- Method: `mergeConfigs(project, global, cliFlags)`
- Deep merge with proper precedence
- **Tests**: Integration tests for merge logic

#### Task 5: Integrate into CLI bootstrap

- **File**: `src/cli/index.ts`
- Modify preAction hook to:
  1. Load global config (existing)
  2. Discover and load project config (new)
  3. Merge configs with CLI flags taking precedence
- **Tests**: E2E tests for config precedence

### Phase 3: CLI Commands (2 hours)

#### Task 6: Add project config commands

```bash
deepl project init           # Create .deepl.toml template
deepl project show           # Display merged config
deepl project validate       # Validate .deepl.toml syntax
```

Implementation in `src/cli/commands/project.ts`:

```typescript
export class ProjectCommand {
  /**
   * Initialize .deepl.toml in current directory
   */
  async init(options: { force?: boolean }): Promise<void>;

  /**
   * Show effective configuration (merged)
   */
  async show(): Promise<void>;

  /**
   * Validate .deepl.toml syntax and schema
   */
  async validate(): Promise<void>;
}
```

**Tests**: E2E tests for all commands

### Phase 4: Documentation (1-2 hours)

#### Task 7: Update documentation

- Remove 🚧 marker from README.md
- Add comprehensive examples to README.md
- Update API.md with new commands
- Update DESIGN.md with architecture details
- Create example `.deepl.toml` files in `examples/`

#### Task 8: Create migration guide

- Document how to migrate from global-only config
- Provide best practices for project vs global config

---

## 4. File Structure Changes

```
src/
├── storage/
│   ├── config.ts              # Existing global config
│   └── project-config.ts      # NEW: Project-level config
├── types/
│   └── project-config.ts      # NEW: Project config types
├── cli/
│   ├── commands/
│   │   └── project.ts         # NEW: Project config commands
│   └── index.ts               # MODIFIED: Add project config integration
└── utils/
    └── config-merge.ts        # NEW: Config merging utilities

tests/
├── unit/
│   └── project-config.test.ts           # NEW: Unit tests
├── integration/
│   └── project-config-merge.test.ts     # NEW: Integration tests
└── e2e/
    └── cli-project.e2e.test.ts          # NEW: E2E tests

examples/
├── .deepl.toml                          # NEW: Example project config
└── 14-project-config.sh                 # NEW: Usage example
```

---

## 5. Implementation Details

### Config Merging Strategy

```typescript
function mergeConfigs(
  projectConfig: ProjectConfig,
  globalConfig: Config,
  cliFlags: Partial<Config>
): Config {
  // Deep merge with precedence: CLI > Project > Global > Defaults
  return {
    // API key always from global config (security)
    auth: globalConfig.auth,

    // Merge defaults with precedence
    defaults: {
      source_lang: cliFlags.source_lang
        ?? projectConfig.defaults?.source_lang
        ?? globalConfig.defaults?.source_lang
        ?? 'en',

      target_langs: cliFlags.target_langs
        ?? projectConfig.defaults?.target_langs
        ?? globalConfig.defaults?.target_langs
        ?? [],

      // ... repeat for all settings
    },

    // Project-specific settings
    project: projectConfig.project,
    paths: projectConfig.paths,
    watch: { ...globalConfig.watch, ...projectConfig.watch },
    batch: { ...globalConfig.batch, ...projectConfig.batch },
  };
}
```

### TOML Validation

```typescript
import * as TOML from '@iarna/toml';
import { z } from 'zod';

const ProjectConfigSchema = z.object({
  project: z.object({
    name: z.string().optional(),
    version: z.string().optional(),
  }).optional(),

  defaults: z.object({
    source_lang: z.enum(['en', 'de', 'es', /* ... */]).optional(),
    target_langs: z.array(z.enum(['en', 'de', /* ... */])).optional(),
    glossary: z.string().optional(),
    formality: z.enum(['default', 'more', 'less', 'prefer_more', 'prefer_less']).optional(),
    preserve_code: z.boolean().optional(),
    preserve_formatting: z.boolean().optional(),
  }).optional(),

  paths: z.object({
    source: z.string().optional(),
    output: z.string().optional(),
  }).optional(),

  watch: z.object({
    enabled: z.boolean().optional(),
    pattern: z.string().optional(),
    auto_commit: z.boolean().optional(),
    debounce: z.number().optional(),
  }).optional(),

  batch: z.object({
    parallel: z.number().min(1).max(10).optional(),
  }).optional(),
});

function loadProjectConfig(configPath: string): ProjectConfig {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = TOML.parse(content);

    // Validate with Zod
    const validated = ProjectConfigSchema.parse(parsed);

    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid .deepl.toml: ${error.message}`);
    }
    throw new Error(`Failed to parse .deepl.toml: ${error.message}`);
  }
}
```

---

## 6. Backwards Compatibility

### ✅ Fully Backward Compatible

- Existing global config continues to work unchanged
- No breaking changes to CLI commands
- Project config is optional - if not found, behavior is identical to current

### Migration Path

```bash
# Step 1: Users continue using global config (no change)
deepl translate "Hello" --to es

# Step 2: Users optionally add .deepl.toml to projects
deepl project init

# Step 3: Project config takes precedence for project-specific settings
deepl translate "Hello"  # Uses target_langs from .deepl.toml
```

---

## 7. Testing Strategy

### Unit Tests (15-20 tests)

- TOML parsing with valid/invalid syntax
- Schema validation with Zod
- File discovery algorithm
- Config merging logic with all precedence combinations

### Integration Tests (10-15 tests)

- Load project config + global config
- Merge configs with various combinations
- CLI integration with project config
- Error handling for malformed TOML

### E2E Tests (8-10 tests)

- `deepl project init` creates valid .deepl.toml
- `deepl project show` displays merged config
- `deepl project validate` catches syntax errors
- Commands respect project config settings
- CLI flags override project config
- Project config overrides global config

### Test Coverage Target

**Overall**: >80% for new code
**Distribution**: ~25-30% integration/e2e, ~70-75% unit tests

---

## 8. Work Estimate

**Total Estimated Time: 12-16 hours**

| Phase | Tasks | Time | Risk |
|-------|-------|------|------|
| 1. Core Infrastructure | TOML parsing, ProjectConfigService, types | 3-4h | Low |
| 2. Config Merging | Precedence logic, CLI integration | 2-3h | Medium |
| 3. CLI Commands | project init/show/validate | 2h | Low |
| 4. Documentation | README, API docs, examples | 1-2h | Low |
| 5. Testing | Unit, integration, E2E tests | 3-4h | Medium |
| 6. Manual Testing & Polish | Bug fixes, UX refinement | 1-2h | Medium |

### Risk Factors

- **Medium Risk**: Config merging complexity - edge cases with deeply nested objects
- **Medium Risk**: File discovery - handling edge cases (symlinks, permissions)
- **Low Risk**: TOML parsing - well-established library

---

## 9. Trade-offs and Decisions

### Decision 1: TOML vs YAML vs JSON

**Chosen: TOML**

**Rationale:**
- ✅ Human-readable and writable
- ✅ Strong typing (no ambiguous strings/numbers)
- ✅ Comments supported
- ✅ Git-friendly (clear diffs)
- ✅ Already documented in DESIGN.md
- ❌ Less common than YAML/JSON

**Alternatives Considered:**
- **YAML**: More common but error-prone (indentation, type ambiguity)
- **JSON**: Less human-friendly, no comments

### Decision 2: File Discovery Strategy

**Chosen: Walk up directory tree**

**Rationale:**
- ✅ Monorepo-friendly (finds root config)
- ✅ Standard behavior (git, npm, etc.)
- ✅ Flexible for nested projects
- ❌ Slower than CWD-only check

**Alternative**: Only check current directory (faster but less flexible)

### Decision 3: Config Precedence Order

**Chosen: CLI > Project > Global > Defaults**

**Rationale:**
- ✅ Intuitive - explicit beats implicit
- ✅ Flexible - allows per-command overrides
- ✅ Consistent with most CLI tools
- ⚠️ Complex merging logic

**Key Decision**: API keys ALWAYS from global config (never project config) for security - prevents accidental commits of API keys.

### Decision 4: Validation Strategy

**Chosen: Zod runtime validation**

**Rationale:**
- ✅ Type-safe (TypeScript types generated from schema)
- ✅ Clear error messages
- ✅ Reusable validation logic
- ❌ Additional dependency

**Alternative**: Manual validation (more code, less type safety)

---

## 10. Security Considerations

### 🔒 Critical Security Rules

#### 1. Never store API keys in project config

- API keys MUST remain in global config only
- Add validation to reject .deepl.toml with API keys
- Document this clearly in error messages

**Implementation:**
```typescript
function validateProjectConfig(config: ProjectConfig): void {
  if ('auth' in config || 'apiKey' in config) {
    throw new Error(
      'API keys cannot be stored in .deepl.toml\n' +
      '\n' +
      'For security, API keys must be stored in global config:\n' +
      '  deepl auth set-key YOUR_API_KEY\n' +
      '\n' +
      'Remove the [auth] section from .deepl.toml'
    );
  }
}
```

#### 2. Validate file paths in project config

- Use `path.resolve()` for all paths from .deepl.toml
- Prevent path traversal attacks
- Validate paths exist before use

**Implementation:**
```typescript
function resolvePaths(projectConfig: ProjectConfig): ProjectConfig {
  if (projectConfig.paths?.source) {
    projectConfig.paths.source = path.resolve(projectConfig.paths.source);
  }
  if (projectConfig.paths?.output) {
    projectConfig.paths.output = path.resolve(projectConfig.paths.output);
  }
  return projectConfig;
}
```

#### 3. .deepl.toml version control guidance

- .deepl.toml SHOULD be committed (contains project settings, not secrets)
- Add warnings in docs about not storing API keys
- Include .deepl.toml example in documentation

#### 4. Validate TOML size limit

- Prevent DoS with massive config files
- Max file size: 10KB (reasonable for config)

**Implementation:**
```typescript
function loadProjectConfig(configPath: string): ProjectConfig {
  const stats = fs.statSync(configPath);

  if (stats.size > 10 * 1024) {
    throw new Error(
      `.deepl.toml is too large (${stats.size} bytes).\n` +
      'Maximum size is 10KB. This file should only contain configuration.'
    );
  }

  // ... rest of loading logic
}
```

---

## 11. User Experience Enhancements

### Helpful Error Messages

#### Bad TOML Syntax
```
Error: Invalid .deepl.toml at line 5:
  target_langs = [es, fr]  # Missing quotes
                  ^^
  Expected: target_langs = ["es", "fr"]
```

#### API Key in Project Config
```
Error: API keys cannot be stored in .deepl.toml
  Found: auth.apiKey in .deepl.toml

  For security, API keys must be stored in global config:
    deepl auth set-key YOUR_API_KEY

  Remove the [auth] section from .deepl.toml
```

#### Invalid Language Code
```
Error: Invalid target language in .deepl.toml:
  defaults.target_langs = ["es", "xyz", "fr"]
                                  ^^^
  "xyz" is not a valid DeepL language code.

  Valid codes: en, de, fr, es, it, ja, ...
  Run: deepl languages --help
```

### Interactive Init

```bash
$ deepl project init

🚀 Initialize DeepL project configuration

Project name: My Awesome App
Source language [en]:
Target languages (comma-separated) [es,fr,de]: es,fr,de,ja
Default glossary (optional): tech-terms
Enable watch mode? [y/N]: y
Auto-commit translations? [y/N]: n

✓ Created .deepl.toml

Next steps:
  1. Review .deepl.toml and adjust settings
  2. Add .deepl.toml to version control
  3. Run: deepl translate README.md
```

---

## 12. Example Implementation Workflow

### For the developer implementing this feature

```bash
# 1. Create feature branch
git checkout -b feat/project-config

# 2. TDD Cycle 1 - TOML Parsing
# Write test
cat > tests/unit/project-config.test.ts
# Implement
cat > src/storage/project-config.ts
npm test

# 3. TDD Cycle 2 - File Discovery
# Write test
# Implement findProjectConfig()
npm test

# 4. TDD Cycle 3 - Config Merging
# Write test in integration tests
# Implement mergeConfigs()
npm test

# 5. TDD Cycle 4 - CLI Integration
# Write E2E test
# Integrate into src/cli/index.ts
npm test

# 6. TDD Cycle 5 - CLI Commands
# Write E2E tests for project commands
# Implement ProjectCommand
npm test

# 7. Manual Testing
npm link
deepl project init
deepl translate "Test" --to es
deepl project show

# 8. Documentation
# Update README.md, API.md, create example
npm run examples

# 9. Commit
git add .
git commit -m "feat(config): implement project-level .deepl.toml configuration

Adds support for project-specific configuration via .deepl.toml files.
Configuration precedence: CLI flags > project config > global config.

Key features:
- TOML-based project configuration
- Automatic file discovery (walks up directory tree)
- Config merging with proper precedence
- New commands: project init, show, validate
- Comprehensive test coverage (44 new tests)
- Full backward compatibility

Includes integration tests with nock for config loading and E2E tests
for CLI commands. Updates README.md and API.md with complete documentation.

Closes #XX"

# 10. Create PR
gh pr create
```

---

## Summary

### Key Metrics

- **Implementation Difficulty**: Medium
- **Estimated Time**: 12-16 hours (2 full dev days)
- **Risk Level**: Low-Medium
- **Value**: High (enables project-specific workflows, team collaboration)

### Key Benefits

- Project-specific defaults (no more `--to es,fr,de` on every command)
- Team collaboration (shared configuration in version control)
- CI/CD friendly (project config in repo, API key in secrets)
- Monorepo support (find config in parent directories)

### Next Steps to Start

1. ✅ Review this implementation plan
2. Create feature branch
3. Add TOML parsing dependency
4. Write first test for ProjectConfigService
5. Implement TDD cycle by cycle

---

**Document Version**: 1.0
**Created**: 2025-10-13
**Status**: Ready for implementation
