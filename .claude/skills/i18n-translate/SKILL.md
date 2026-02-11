---
name: i18n-translate
description: This skill should be used when the user asks to "translate locale files", "add a language", "find missing translations", "i18n", "localize", "internationalize", "dry run translations", "audit translations", or "init i18n config". It detects the i18n framework, finds missing translations, translates with DeepL CLI, and validates output.
---

# i18n Translation Skill

Automates the end-to-end i18n workflow: detect framework, discover locale files, diff missing keys, translate with DeepL CLI, validate output, and commit per locale.

## Quick Reference: Entry Modes

| Mode | When to use | What it does |
|---|---|---|
| **Quick** | "Translate to Spanish" | Detect → diff one target → translate → validate → commit |
| **Audit** | "Find missing translations" | Detect → diff all targets → validate → report (no writes) |
| **Full** | "Translate all locales" | Detect → diff all targets → translate all → validate all → commit all |
| **Manual** | "Run diff-locale-keys on X and Y" | Direct script invocation, no workflow |

## Project Configuration (.deepl-i18n.json)

On first run, check for `.deepl-i18n.json` in the project root. If missing, ask the user for source locale and target locales, then create it:

```json
{
  "sourceLocale": "en",
  "targetLocales": ["es", "fr", "de"],
  "framework": "i18next",
  "formality": "prefer_more",
  "glossary": "my-glossary",
  "localePaths": ["public/locales/"],
  "excludePaths": ["**/node_modules/**"]
}
```

If the file exists, read settings from it instead of prompting. The `framework` field overrides auto-detection.

Config script: `scripts/lib/config.ts` — use `loadProjectConfig()` and `saveProjectConfig()`.

## Phase 1: Detect Framework

Run the detection script:

```bash
npx tsx .claude/skills/i18n-translate/scripts/detect-framework.ts [--root <dir>] [--format json|text]
```

**Detection order** (stop at first match):

| File | Package | Framework | Interpolation |
|---|---|---|---|
| `package.json` | `react-intl` / `@formatjs/intl` | react-intl | `{name}`, ICU `{count, plural, ...}` |
| `package.json` | `i18next` / `react-i18next` / `next-i18next` | i18next | `{{name}}`, `$t(key)` |
| `package.json` | `next-intl` | next-intl | `{name}`, ICU |
| `package.json` | `vue-i18n` / `@intlify/vue-i18n` | vue-i18n | `{name}`, `@:key`, `{name \| modifier}` |
| `package.json` | `@angular/localize` / `@ngx-translate/core` | Angular | `{{name}}`, `{$INTERPOLATION}` |
| `Gemfile` | `i18n` / `rails-i18n` | Rails | `%{name}`, `%<name>s` |
| `pubspec.yaml` | `flutter_localizations` / `intl` | Flutter | `{name}`, ICU |
| glob | `**/res/values/strings.xml` | Android | `%s`, `%d`, `%1$s` |
| glob | `**/*.lproj/Localizable.strings` | iOS | `%@`, `%d`, `%1$@` |

If no match, assume **generic** with `{name}` / `${name}` interpolation (fully covered by `--preserve-code`).

If `.deepl-i18n.json` has a `framework` field, skip detection and use that.

**Monorepo support**: If `config.monorepo.packages` is set, iterate each workspace and detect/translate independently.

Report the detected framework to the user before proceeding.

See `references/framework-detection.md` for the full detection heuristic table.

## Phase 2: Discover Locale Structure

Find the source locale and target locale files. Check these common locations:

| Pattern | Layout | Example |
|---|---|---|
| `locales/<lang>.json` | Single directory | `locales/en.json`, `locales/es.json` |
| `locales/<lang>/*.json` | Directory per locale | `locales/en/common.json` |
| `public/locales/<lang>/*.json` | i18next default | `public/locales/en/translation.json` |
| `src/locales/<lang>.json` | In-source | `src/locales/en.json` |
| `config/locales/<lang>.yml` | Rails | `config/locales/en.yml` |
| `lib/l10n/app_<lang>.arb` | Flutter | `lib/l10n/app_en.arb` |
| `src/i18n/<lang>.json` | Generic | `src/i18n/en.json` |
| `messages/<lang>.json` | next-intl | `messages/en.json` |
| `app/src/main/res/values/strings.xml` | Android | `values-es/strings.xml` |
| `<lang>.lproj/Localizable.strings` | iOS | `es.lproj/Localizable.strings` |

**Steps:**

1. If `.deepl-i18n.json` has `localePaths`, search those. Otherwise search: `**/locales/**`, `**/i18n/**`, `**/messages/**`, `**/l10n/**`
2. Identify the source locale (from config or default `en`)
3. List existing target locales
4. Determine the file layout pattern (single-file, directory-per-locale, namespace-split, Rails YAML)

If no config, ask the user to confirm:
- Source locale (default: `en`)
- Target locales (default: all existing + any requested new ones)

## Phase 3: Diff Missing Keys

Compare source vs target to find what needs translation.

```bash
npx tsx .claude/skills/i18n-translate/scripts/diff-locale-keys.ts <source> <target> [--format json|text] [--strings-only]
```

Handles JSON, YAML, and ARB files natively. Uses `KeyPath[]` comparison (no dot-join ambiguity for keys containing dots).

The diff reports:
- **Missing keys** — in source but not in target (need translation)
- **Extra keys** — in target but not in source (may be stale)
- **Empty values** — key exists in target but value is empty string

Exit codes: 0 = no missing, 1 = missing found, 2 = error.

For **audit mode**: run diff against all targets and stop here with a report.

If only missing keys exist, proceed to translation. If extra keys exist, warn the user and ask whether to remove them.

## Phase 4: Translate

### Dry-Run Mode

If the user requests a dry run, show what would be translated without making API calls:

1. Run diff for all targets
2. Count missing keys and estimate cost
3. Report without translating or writing files

### Interpolation Preprocessing

**CRITICAL**: Before translating, preprocess interpolation patterns NOT covered by `--preserve-code`.

The CLI's `--preserve-code` handles: `${name}`, `{name}`, `{0}`, `%s`, `%d`.

**NOT handled** (must preprocess using `scripts/lib/interpolation.ts`):

| Pattern | Framework | Action |
|---|---|---|
| `{{name}}` | i18next, Angular | Replace with `__INTL_{hex}__` placeholder |
| `%{name}` | Rails | Replace with `__INTL_{hex}__` placeholder |
| `$t(key)` | i18next nesting | Replace with `__INTL_{hex}__` placeholder |
| `@:key` | vue-i18n linked | Replace with `__INTL_{hex}__` placeholder |
| ICU `{count, plural, ...}` | react-intl, next-intl, flutter | Replace entire expression with single placeholder |
| `{name \| modifier}` | vue-i18n | Replace with `__INTL_{hex}__` placeholder |

Preprocessing uses UUID-style `__INTL_{8-hex}__` placeholders (via `crypto.randomBytes`) instead of sequential `__INTL_N__` to avoid collision risk across parallel jobs.

See `references/interpolation-patterns.md` for the full per-framework coverage analysis.

**Steps:**

1. Read the source file with `parseLocaleFile()`
2. For each string value, call `preprocessString(text, framework)`
3. Record the placeholder maps
4. Write preprocessed data to a temp file
5. Translate with DeepL CLI
6. Call `restoreString()` on each translated value using the saved maps

### Translation Commands

**Single file (full translation):**

```bash
deepl translate <source.json> --to <lang> --preserve-code
```

**Single file with glossary:**

```bash
deepl translate <source.json> --to <lang> --preserve-code --glossary <glossary-id>
```

Read glossary from `.deepl-i18n.json` if set.

**Incremental translation (missing keys only):**

1. Extract missing key-value pairs from source into a temp JSON file
2. Translate the temp file:
   ```bash
   deepl translate /tmp/missing-keys.json --to <lang> --preserve-code
   ```
3. Deep-merge the translated result into the existing target:
   ```bash
   npx tsx .claude/skills/i18n-translate/scripts/deep-merge.ts <target> <translated-missing> [--dry-run]
   ```

**Directory-per-locale (namespace-split):**

Translate each namespace file separately:

```bash
for ns_file in locales/en/*.json; do
  ns=$(basename "$ns_file")
  deepl translate "$ns_file" --to <lang> --preserve-code
done
```

### Output Path Handling

The CLI generates `<name>.<lang>.<ext>` by default (e.g., `en.es.json`). Most frameworks expect `es.json` or `es/common.json`.

**After translation, rename/move the output:**

```bash
# Single-file layout: en.json → es.json
mv en.<lang>.json <lang>.json

# Directory layout: en/common.json → create es/ and move
mkdir -p locales/<lang>
mv locales/en/common.<lang>.json locales/<lang>/common.json

# Rails: en.yml → es.yml, also fix the top-level YAML key
# The top-level key must change from 'en:' to '<lang>:'
```

### Formality

If the target language supports formality (DE, FR, IT, NL, PL, PT, ES, JA, RU):
1. Check `.deepl-i18n.json` for `formality` setting
2. If not set, ask the user
3. Pass `--formality more` or `--formality less`

## Phase 5: Validate

After translation, verify output integrity:

```bash
npx tsx .claude/skills/i18n-translate/scripts/validate-locale.ts <source> <translated> [--framework <name>] [--format json|text]
```

**Checks performed:**

1. **Valid JSON/YAML** — output parses without error
2. **Key structure match** — translated file has exactly the same keys as source (uses KeyPath comparison)
3. **No placeholder residue** — no `__INTL_{hex}__` placeholders left in output
4. **Interpolation preserved** — all framework-specific variables from source appear in translated values
5. **Untranslated values** — warn if values are identical to source (don't fail — brand names, URLs are legitimately the same)

Exit codes: 0 = pass, 1 = fail, 2 = error.

If validation fails, report specific failures and attempt auto-fix by re-translating the failed keys. If auto-fix fails, report to user.

## Phase 6: Commit

Create one commit per target locale:

```bash
git add <locale-files-for-lang>
git commit -m "i18n(<lang>): add/update <lang> translations"
```

If translating multiple locales, create separate commits so each can be reviewed independently.

Skip this phase in audit mode. Do NOT push unless the user explicitly requests it.

## Mode Workflows

### Quick Mode

Default when user says "translate to X":

1. Detect framework
2. Discover locale files
3. Diff source → single target
4. Translate missing keys
5. Validate
6. Commit

### Audit Mode

When user says "find missing translations" or "audit translations":

1. Detect framework
2. Discover locale files
3. Diff source → all targets
4. Validate existing translations
5. Report findings (no writes, no commits)

### Full Mode

When user says "translate all locales":

1. Detect framework
2. Discover locale files
3. For each target locale:
   a. Diff missing keys
   b. Translate
   c. Validate
   d. Commit

### Manual Mode

Direct script invocations for advanced use:

```bash
npx tsx .claude/skills/i18n-translate/scripts/detect-framework.ts [--root <dir>]
npx tsx .claude/skills/i18n-translate/scripts/diff-locale-keys.ts <source> <target> [--strings-only]
npx tsx .claude/skills/i18n-translate/scripts/validate-locale.ts <source> <translated> [--framework <name>]
npx tsx .claude/skills/i18n-translate/scripts/deep-merge.ts <base> <patch> [--output <path>] [--dry-run]
```

## Script Reference

| Script | Purpose | Example |
|---|---|---|
| `detect-framework.ts` | Auto-detect i18n framework | `npx tsx scripts/detect-framework.ts --format json` |
| `diff-locale-keys.ts` | Find missing/extra/empty keys | `npx tsx scripts/diff-locale-keys.ts en.json es.json` |
| `validate-locale.ts` | Validate translated file integrity | `npx tsx scripts/validate-locale.ts en.json es.json --framework i18next` |
| `deep-merge.ts` | Merge translated keys into target | `npx tsx scripts/deep-merge.ts es.json translated.json --dry-run` |

All scripts are in `.claude/skills/i18n-translate/scripts/` and run via `npx tsx`.

## References

- `references/framework-detection.md` — full detection heuristic table with config file hints
- `references/interpolation-patterns.md` — per-framework coverage analysis and UUID strategy
