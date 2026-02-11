# Interpolation Patterns & CLI Coverage

## DeepL CLI `--preserve-code` Coverage

The CLI's `preserveVariables` function (src/services/translation.ts:413-436) handles these patterns:

| Pattern | Regex | Example | Covered |
|---|---|---|---|
| `${name}` | `/\$\{[a-zA-Z0-9_]+\}/g` | `Hello ${user}` | YES |
| `{name}` | `/\{[a-zA-Z0-9_]+\}/g` | `Hello {user}` | YES |
| `{0}` | `/\{[a-zA-Z0-9_]+\}/g` | `{0} items` | YES |
| `%s`, `%d` | `/%[sd]/g` | `%s items` | YES |

## Patterns NOT Covered (Require Preprocessing)

### `{{name}}` — i18next, Angular

**Regex:** `/\{\{[a-zA-Z0-9_]+\}\}/g`

**Problem:** The inner `{name}` gets matched by the `{name}` pattern, but the outer braces are left as `{__VAR_0__}` which DeepL may mangle.

**Preprocessing:**

```javascript
let counter = 0;
const map = new Map();
const preprocessed = text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match) => {
  const placeholder = `__INTL_${counter++}__`;
  map.set(placeholder, match);
  return placeholder;
});
// After translation: restore placeholders from map
```

### `%{name}` — Rails

**Regex:** `/%\{[a-zA-Z0-9_]+\}/g`

**Problem:** The `%s`/`%d` pattern only matches literal `%s` and `%d`, not `%{user}`.

**Preprocessing:**

```javascript
const preprocessed = text.replace(/%\{([a-zA-Z0-9_]+)\}/g, (match) => {
  const placeholder = `__INTL_${counter++}__`;
  map.set(placeholder, match);
  return placeholder;
});
```

### `$t(key)` — i18next Nesting

**Regex:** `/\$t\([^)]+\)/g`

**Problem:** Not matched by any CLI pattern. DeepL may translate the key name.

**Preprocessing:**

```javascript
const preprocessed = text.replace(/\$t\([^)]+\)/g, (match) => {
  const placeholder = `__INTL_${counter++}__`;
  map.set(placeholder, match);
  return placeholder;
});
```

### `@:key` — vue-i18n Linked Messages

**Regex:** `/@:[a-zA-Z0-9_.]+/g`

**Problem:** Not matched by any CLI pattern. The `@:` prefix and key path would be treated as translatable text.

**Preprocessing:**

```javascript
const preprocessed = text.replace(/@:[a-zA-Z0-9_.]+/g, (match) => {
  const placeholder = `__INTL_${counter++}__`;
  map.set(placeholder, match);
  return placeholder;
});
```

### ICU Plural/Select — react-intl, next-intl, Flutter

**Regex:** Complex nested structure, cannot use simple regex.

**Example:** `{count, plural, one {# item} other {# items}}`

**Problem:** The outer `{count, plural, ...}` partially matches `{count}` pattern but the ICU syntax inside gets broken.

**Preprocessing approach:**

1. Parse the ICU message using a proper parser (or manual brace matching)
2. Extract translatable text segments (the values inside each plural/select branch)
3. Replace each segment with `__INTL_N__`
4. Translate segments individually
5. Reassemble the ICU structure

**Simplified approach for common cases:**

```javascript
// For simple plurals: {count, plural, one {# item} other {# items}}
// Extract "# item" and "# items", translate separately, reassemble
const icuPattern = /\{(\w+),\s*(plural|select|selectordinal),\s*(.*)\}/gs;
```

**Recommendation:** For ICU messages, warn the user that automatic translation may produce incorrect plural forms. Suggest manual review of plural rules for the target language.

### `{name | modifier}` — vue-i18n Modifiers

**Regex:** `/\{[a-zA-Z0-9_]+\s*\|\s*[a-zA-Z0-9_]+\}/g`

**Problem:** The `{name}` pattern matches `{name` but not the `| modifier}` part.

**Preprocessing:**

```javascript
const preprocessed = text.replace(/\{([a-zA-Z0-9_]+)\s*\|\s*([a-zA-Z0-9_]+)\}/g, (match) => {
  const placeholder = `__INTL_${counter++}__`;
  map.set(placeholder, match);
  return placeholder;
});
```

### `%<name>s` — Rails Kernel#sprintf

**Regex:** `/%<[a-zA-Z0-9_]+>[sd]/g`

**Problem:** Not matched by `%s`/`%d` pattern (those only match literal `%s` and `%d`).

**Preprocessing:**

```javascript
const preprocessed = text.replace(/%<([a-zA-Z0-9_]+)>[a-z]/g, (match) => {
  const placeholder = `__INTL_${counter++}__`;
  map.set(placeholder, match);
  return placeholder;
});
```

## Framework Coverage Summary

| Framework | Safe (no preprocessing) | Needs preprocessing |
|---|---|---|
| Generic | `{name}`, `${name}`, `%s` | — |
| react-intl | `{name}` | ICU plurals/select |
| i18next | — | `{{name}}`, `$t(key)` |
| next-intl | `{name}` | ICU plurals/select |
| vue-i18n | `{name}` | `@:key`, `{name \| mod}` |
| Angular | — | `{{name}}`, `{$INTERPOLATION}` |
| Rails | — | `%{name}`, `%<name>s` |
| Flutter | `{name}` | ICU plurals/select |
