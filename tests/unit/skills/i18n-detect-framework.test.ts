import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { detectFramework } from '../../../.claude/skills/i18n-translate/scripts/detect-framework';

describe('detectFramework', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'detect-fw-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should detect i18next from package.json dependencies', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { 'i18next': '^23.0.0', 'react': '^18.0.0' },
    }));

    const result = await detectFramework(tmpDir);
    expect(result.name).toBe('i18next');
    expect(result.source).toBe('detection');
    expect(result.interpolation).toEqual(['{{name}}', '$t(key)']);
    expect(result.localeDir).toBe('public/locales/');
  });

  it('should detect react-intl from package.json dependencies', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { 'react-intl': '^6.0.0' },
    }));

    const result = await detectFramework(tmpDir);
    expect(result.name).toBe('react-intl');
    expect(result.source).toBe('detection');
    expect(result.interpolation).toEqual(['{name}', 'ICU']);
  });

  it('should detect rails from Gemfile', async () => {
    await fs.writeFile(path.join(tmpDir, 'Gemfile'), `
source 'https://rubygems.org'
gem 'rails', '~> 7.0'
gem 'rails-i18n'
gem 'puma'
`);

    const result = await detectFramework(tmpDir);
    expect(result.name).toBe('rails');
    expect(result.source).toBe('detection');
    expect(result.interpolation).toEqual(['%{name}', '%<name>s']);
    expect(result.localeDir).toBe('config/locales/');
  });

  it('should detect flutter from pubspec.yaml', async () => {
    await fs.writeFile(path.join(tmpDir, 'pubspec.yaml'), `
name: my_app
dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  intl: ^0.18.0
`);

    const result = await detectFramework(tmpDir);
    expect(result.name).toBe('flutter');
    expect(result.source).toBe('detection');
    expect(result.interpolation).toEqual(['{name}', 'ICU']);
    expect(result.localeDir).toBe('lib/l10n/');
  });

  it('should return config override from .deepl-i18n.json', async () => {
    await fs.writeFile(path.join(tmpDir, '.deepl-i18n.json'), JSON.stringify({
      sourceLocale: 'en',
      targetLocales: ['de'],
      framework: 'vue-i18n',
    }));
    // Also add a package.json with i18next to prove config takes precedence
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { 'i18next': '^23.0.0' },
    }));

    const result = await detectFramework(tmpDir);
    expect(result.name).toBe('vue-i18n');
    expect(result.source).toBe('config');
    expect(result.interpolation).toEqual(['{name}', '@:key', '{name | modifier}']);
  });

  it('should return generic fallback when no framework found', async () => {
    // Empty directory — no dep files
    const result = await detectFramework(tmpDir);
    expect(result.name).toBe('generic');
    expect(result.source).toBe('detection');
    expect(result.interpolation).toEqual([]);
    expect(result.localeDir).toBeUndefined();
  });

  it('should detect Android from strings.xml', async () => {
    const resDir = path.join(tmpDir, 'app', 'src', 'main', 'res', 'values');
    await fs.mkdir(resDir, { recursive: true });
    await fs.writeFile(path.join(resDir, 'strings.xml'), '<resources></resources>');

    const result = await detectFramework(tmpDir);
    expect(result.name).toBe('android');
    expect(result.source).toBe('detection');
    expect(result.interpolation).toEqual(['%s', '%d', '%1$s']);
    expect(result.localeDir).toBe('app/src/main/res/values/');
  });

  it('should detect iOS from Localizable.strings', async () => {
    const lprojDir = path.join(tmpDir, 'en.lproj');
    await fs.mkdir(lprojDir, { recursive: true });
    await fs.writeFile(path.join(lprojDir, 'Localizable.strings'), '"key" = "value";');

    const result = await detectFramework(tmpDir);
    expect(result.name).toBe('ios');
    expect(result.source).toBe('detection');
    expect(result.interpolation).toEqual(['%@', '%d', '%1$@']);
  });

  it('should pick first matching framework when multiple i18n deps present', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: {
        'react-intl': '^6.0.0',
        'i18next': '^23.0.0',
        'vue-i18n': '^9.0.0',
      },
    }));

    const result = await detectFramework(tmpDir);
    // react-intl comes first in FRAMEWORK_RULES
    expect(result.name).toBe('react-intl');
  });

  it('should check devDependencies as well', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { 'react': '^18.0.0' },
      devDependencies: { 'next-i18next': '^14.0.0' },
    }));

    const result = await detectFramework(tmpDir);
    expect(result.name).toBe('i18next');
    expect(result.source).toBe('detection');
  });

  it('should throw for non-existent root directory', async () => {
    const badPath = path.join(tmpDir, 'does-not-exist');
    await expect(detectFramework(badPath)).rejects.toThrow('Directory does not exist');
  });

  it('should detect configFile when present for i18next', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { 'next-i18next': '^14.0.0' },
    }));
    await fs.writeFile(path.join(tmpDir, 'next-i18next.config.js'), 'module.exports = {};');

    const result = await detectFramework(tmpDir);
    expect(result.name).toBe('i18next');
    expect(result.configFile).toBe(path.join(tmpDir, 'next-i18next.config.js'));
  });
});
