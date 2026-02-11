---
name: i18n-translate
description: This skill should be used when the user asks to "translate locale files", "add a language", "find missing translations", "i18n", "localize", or "internationalize". It detects the i18n framework, finds missing translations, translates with DeepL CLI, and validates output.
---

# i18n Translation Skill

Automates the end-to-end i18n workflow: detect framework, discover locale files, diff missing keys, translate with DeepL CLI, validate output, and commit per locale.

## Workflow Overview

```
Detect → Discover → Diff → Translate → Validate → Commit
```

Run each phase sequentially. Stop and report to the user if any phase fails.

## Phase 1: Detect Framework

Check the project root for dependency files and match against known i18n frameworks.

**Detection order** (stop at first match):

| File | Package | Framework | Interpolation |
|---|---|---|---|
| `package.json` | `react-intl` / `@formatjs/intl` | react-intl | `{name}`, ICU `{count, plural, ...}` |
| `package.json` | `i18next` / `react-i18next` / `next-i18next` | i18next | `{{name}}`, `$t(key)` |
| `package.json` | `next-intl` | next-intl | `{name}`, ICU |
| `package.json` | `vue-i18n` | vue-i18n | `{name}`, `@:key`, `{name} \| modifier` |
| `package.json` | `@angular/localize` / `@ngx-translate/core` | Angular | `{{name}}`, `{$INTERPOLATION}` |
| `Gemfile` | `i18n` / `rails-i18n` | Rails | `%{name}` |
| `pubspec.yaml` | `flutter_localizations` / `intl` | Flutter | `{name}`, ICU |

If no match, assume **generic JSON** with `{name}` / `${name}` interpolation (fully covered by `--preserve-code`).

**Implementation:**

```bash
# Check package.json dependencies
if [ -f package.json ]; then
  grep -q '"react-intl"\|"@formatjs/intl"' package.json && echo "react-intl"
  grep -q '"i18next"\|"react-i18next"\|"next-i18next"' package.json && echo "i18next"
  grep -q '"next-intl"' package.json && echo "next-intl"
  grep -q '"vue-i18n"' package.json && echo "vue-i18n"
  grep -q '"@angular/localize"\|"@ngx-translate/core"' package.json && echo "angular"
fi
if [ -f Gemfile ]; then
  grep -q "rails-i18n\|gem ['\"]i18n['\"]" Gemfile && echo "rails"
fi
if [ -f pubspec.yaml ]; then
  grep -q "flutter_localizations\|intl" pubspec.yaml && echo "flutter"
fi
```

Report the detected framework to the user before proceeding.

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

**Steps:**

1. Search for locale directories using Glob: `**/locales/**`, `**/i18n/**`, `**/messages/**`, `**/l10n/**`
2. Identify the source locale (usually `en` or `en-US`)
3. List existing target locales
4. Determine the file layout pattern (single-file, directory-per-locale, namespace-split, Rails YAML)

Ask the user to confirm:
- Source locale (default: `en`)
- Target locales (default: all existing + any requested new ones)

## Phase 3: Diff Missing Keys

Compare source vs target to find what needs translation.

**For JSON files**, use the helper script:

```bash
bash .claude/skills/i18n-translate/scripts/diff-locale-keys.sh <source.json> <target.json>
```

**For YAML files** (Rails), use inline key extraction since `jq` doesn't handle YAML. Read both files and compare key paths programmatically.

The diff reports:
- **Missing keys** — in source but not in target (need translation)
- **Extra keys** — in target but not in source (may be stale)
- **Empty values** — key exists in target but value is empty string

If only missing keys exist, proceed to incremental translation (Phase 4). If extra keys exist, warn the user and ask whether to remove them.

## Phase 4: Translate

### Interpolation Preprocessing

**CRITICAL**: Before translating, check whether the detected framework uses interpolation patterns NOT covered by `--preserve-code`.

The CLI's `--preserve-code` handles:
- `${name}` — YES
- `{name}`, `{0}` — YES
- `%s`, `%d` — YES

**NOT handled** (must preprocess):

| Pattern | Framework | Example | Workaround |
|---|---|---|---|
| `{{name}}` | i18next, Angular | `Hello {{user}}` | Replace `{{...}}` with `__INTL_N__` before translate, restore after |
| `%{name}` | Rails | `Hello %{user}` | Replace `%{...}` with `__INTL_N__` before translate, restore after |
| `$t(key)` | i18next nesting | `$t(common.greeting)` | Replace `$t(...)` with `__INTL_N__` before translate, restore after |
| `@:key` | vue-i18n linked | `@:common.greeting` | Replace `@:...` (to next space/EOL) with `__INTL_N__` before translate, restore after |
| ICU `{count, plural, ...}` | react-intl, next-intl | `{count, plural, one {# item} other {# items}}` | Translate inner text segments only, preserve ICU skeleton |
| `{name \| modifier}` | vue-i18n | `{name \| capitalize}` | Replace entire `{...\|...}` with `__INTL_N__` before translate, restore after |

**Preprocessing approach:**

1. Read the source file
2. For each value string, replace unsupported patterns with numbered `__INTL_0__`, `__INTL_1__` placeholders
3. Record the mapping (placeholder → original)
4. Write preprocessed file to a temp location
5. Translate with DeepL CLI
6. Restore placeholders from the mapping

### Translation Commands

**Single file (full translation):**

```bash
deepl translate <source.json> --to <lang> --preserve-code
```

**Single file with glossary:**

```bash
deepl translate <source.json> --to <lang> --preserve-code --glossary <glossary-id>
```

**Incremental translation (missing keys only):**

1. Extract missing key-value pairs from source into a temp JSON file
2. Translate the temp file:
   ```bash
   deepl translate /tmp/missing-keys.json --to <lang> --preserve-code
   ```
3. Deep-merge the translated result into the existing target file

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

If the target language supports formality (DE, FR, IT, NL, PL, PT, ES, JA, RU), ask the user whether they want formal or informal tone. Pass `--formality more` or `--formality less` accordingly.

## Phase 5: Validate

After translation, verify output integrity.

**Use the validation script:**

```bash
bash .claude/skills/i18n-translate/scripts/validate-locale.sh <source.json> <translated.json> --framework <name>
```

**Checks performed:**

1. **Valid JSON/YAML** — output parses without error
2. **Key structure match** — translated file has exactly the same keys as source
3. **No untranslated values** — no values identical to source (warn, don't fail — some values like brand names are legitimately the same)
4. **Interpolation preserved** — all variables from source appear in translated values
5. **No placeholder residue** — no `__INTL_N__` or `__VAR_N__` placeholders left in output

If validation fails, report specific failures and attempt to fix automatically (re-translate problematic keys). If auto-fix fails, report to user.

## Phase 6: Commit

Create one commit per target locale:

```bash
git add <locale-files-for-lang>
git commit -m "i18n(<lang>): add/update <lang> translations"
```

If translating multiple locales, create separate commits so each can be reviewed independently.

Do NOT push unless the user explicitly requests it.

## Interpolation Gap Reference

See `references/interpolation-patterns.md` for detailed per-framework coverage analysis and preprocessing snippets.

## Framework Detection Reference

See `references/framework-detection.md` for the complete detection heuristic table.
