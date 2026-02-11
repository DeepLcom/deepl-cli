# Framework Detection Reference

## Detection Table

| Framework | Dependency File | Key Packages | Config Files | Default Locale Dir | Format | Interpolation |
|-----------|----------------|--------------|-------------|-------------------|--------|--------------|
| react-intl | `package.json` | `react-intl`, `@formatjs/intl` | — | `src/locales/` | JSON | `{name}`, ICU |
| i18next | `package.json` | `i18next`, `react-i18next`, `next-i18next` | `i18next.config.js`, `next-i18next.config.js` | `public/locales/` | JSON | `{{name}}`, `$t(key)` |
| next-intl | `package.json` | `next-intl` | — | `messages/` | JSON | `{name}`, ICU |
| vue-i18n | `package.json` | `vue-i18n`, `@intlify/vue-i18n` | — | `locales/` | JSON/YAML | `{name}`, `@:key`, `{name \| modifier}` |
| angular | `package.json` | `@angular/localize`, `@ngx-translate/core` | — | `src/assets/i18n/` | JSON | `{{name}}`, `{$INTERPOLATION}` |
| rails | `Gemfile` | `i18n`, `rails-i18n` | — | `config/locales/` | YAML | `%{name}`, `%<name>s` |
| flutter | `pubspec.yaml` | `flutter_localizations`, `intl` | `l10n.yaml` | `lib/l10n/` | ARB | `{name}`, ICU |
| Android | `build.gradle` / glob | `**/res/values/strings.xml` | — | `app/src/main/res/values/` | XML | `%s`, `%d`, `%1$s` |
| iOS | `*.xcodeproj` / glob | `**/*.lproj/Localizable.strings` | — | `*.lproj/` | `.strings` | `%@`, `%d`, `%1$@` |

## Detection Priority

The detection algorithm checks in this order:

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
