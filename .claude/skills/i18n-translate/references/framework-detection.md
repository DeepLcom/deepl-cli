# Framework Detection Heuristics

## Detection Table

| Framework | Dep File | Package Names | Config Files | Default Locale Dir | File Format | Interpolation |
|---|---|---|---|---|---|---|
| react-intl | `package.json` | `react-intl`, `@formatjs/intl` | — | `src/locales/`, `locales/`, `src/i18n/` | JSON | `{name}`, ICU plurals |
| i18next | `package.json` | `i18next`, `react-i18next`, `next-i18next` | `i18next.config.js`, `next-i18next.config.js` | `public/locales/<lang>/` | JSON | `{{name}}`, `$t(key)`, `$t(key, {"count": N})` |
| next-intl | `package.json` | `next-intl` | `i18n.ts`, `next.config.js` (with `createNextIntlPlugin`) | `messages/` | JSON | `{name}`, ICU plurals |
| vue-i18n | `package.json` | `vue-i18n`, `@intlify/vue-i18n` | `vue.config.js`, `nuxt.config.ts` (i18n module) | `locales/`, `src/locales/`, `src/i18n/` | JSON, YAML | `{name}`, `@:key` (linked), `{name \| modifier}` |
| Angular | `package.json` | `@angular/localize`, `@ngx-translate/core` | `angular.json` (i18n section) | `src/assets/i18n/`, `src/locale/` | JSON, XLIFF | `{{name}}`, `{$INTERPOLATION}` |
| Rails | `Gemfile` | `i18n`, `rails-i18n` | `config/application.rb` (i18n config) | `config/locales/` | YAML | `%{name}`, `%<name>s` |
| Flutter | `pubspec.yaml` | `flutter_localizations`, `intl` | `l10n.yaml` | `lib/l10n/` | ARB (JSON) | `{name}`, ICU plurals |
| Android | `build.gradle` / glob | `**/res/values/strings.xml` | — | `app/src/main/res/values/` | XML | `%s`, `%d`, `%1$s` |
| iOS | `*.xcodeproj` / glob | `**/*.lproj/Localizable.strings` | — | `*.lproj/` | `.strings` | `%@`, `%d`, `%1$@` |
| Generic | — | — | — | `locales/`, `i18n/`, `translations/` | JSON | `{name}`, `${name}` |

## Detection Priority

Check in this order (first match wins):

1. `.deepl-i18n.json` config file (explicit override)
2. `package.json` → `react-intl` / `@formatjs/intl`
3. `package.json` → `i18next` / `react-i18next` / `next-i18next`
4. `package.json` → `next-intl`
5. `package.json` → `vue-i18n` / `@intlify/vue-i18n`
6. `package.json` → `@angular/localize` / `@ngx-translate/core`
7. `Gemfile` → `i18n` / `rails-i18n`
8. `pubspec.yaml` → `flutter_localizations` / `intl`
9. `**/res/values/strings.xml` → Android
10. `**/*.lproj/Localizable.strings` → iOS
11. Fall back to generic

First match wins. The config file override always takes precedence over auto-detection.

## Config File Hints

When a framework is detected, check its config file for locale settings:

### i18next

```js
// i18next.config.js or next-i18next.config.js
module.exports = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr', 'de', 'es'],
  },
};
```

### next-intl

```ts
// i18n.ts
export const locales = ['en', 'de', 'fr'] as const;
export const defaultLocale = 'en';
```

### vue-i18n

```js
// vue.config.js or i18n config
export default {
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, fr, de },
};
```

### Rails

```ruby
# config/application.rb
config.i18n.default_locale = :en
config.i18n.available_locales = [:en, :fr, :de, :es]
```

### Flutter

```yaml
# l10n.yaml
arb-dir: lib/l10n
template-arb-file: app_en.arb
output-localization-file: app_localizations.dart
```
