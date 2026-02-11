import * as fs from 'fs/promises';
import * as path from 'path';
import type { DetectedFramework, I18nProjectConfig } from './lib/types.js';

interface FrameworkRule {
  name: string;
  depFile: string;
  packages: string[];
  interpolation: string[];
  configFiles?: string[];
  localeDir?: string;
}

const FRAMEWORK_RULES: FrameworkRule[] = [
  { name: 'react-intl', depFile: 'package.json', packages: ['react-intl', '@formatjs/intl'], interpolation: ['{name}', 'ICU'], localeDir: 'src/locales/' },
  { name: 'i18next', depFile: 'package.json', packages: ['i18next', 'react-i18next', 'next-i18next'], interpolation: ['{{name}}', '$t(key)'], configFiles: ['i18next.config.js', 'next-i18next.config.js'], localeDir: 'public/locales/' },
  { name: 'next-intl', depFile: 'package.json', packages: ['next-intl'], interpolation: ['{name}', 'ICU'], localeDir: 'messages/' },
  { name: 'vue-i18n', depFile: 'package.json', packages: ['vue-i18n', '@intlify/vue-i18n'], interpolation: ['{name}', '@:key', '{name | modifier}'], localeDir: 'locales/' },
  { name: 'angular', depFile: 'package.json', packages: ['@angular/localize', '@ngx-translate/core'], interpolation: ['{{name}}', '{$INTERPOLATION}'], localeDir: 'src/assets/i18n/' },
  { name: 'rails', depFile: 'Gemfile', packages: ['i18n', 'rails-i18n'], interpolation: ['%{name}', '%<name>s'], localeDir: 'config/locales/' },
  { name: 'flutter', depFile: 'pubspec.yaml', packages: ['flutter_localizations', 'intl'], interpolation: ['{name}', 'ICU'], configFiles: ['l10n.yaml'], localeDir: 'lib/l10n/' },
];

async function checkPackageJson(filePath: string, packages: string[]): Promise<boolean> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const deps = (pkg['dependencies'] ?? {}) as Record<string, unknown>;
    const devDeps = (pkg['devDependencies'] ?? {}) as Record<string, unknown>;
    return packages.some(p => p in deps || p in devDeps);
  } catch {
    return false;
  }
}

async function checkTextFile(filePath: string, packages: string[]): Promise<boolean> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return packages.some(p => raw.includes(p));
  } catch {
    return false;
  }
}

async function findFile(dir: string, matcher: (relativePath: string) => boolean): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const parentDir = (entry as { parentPath?: string; path?: string }).parentPath
        ?? (entry as { parentPath?: string; path?: string }).path
        ?? '';
      const fullPath = path.join(parentDir, entry.name);
      const rel = path.relative(dir, fullPath);
      if (matcher(rel)) return true;
    }
  } catch {
    // Directory read error
  }
  return false;
}

export async function detectFramework(root?: string): Promise<DetectedFramework> {
  const projectRoot = root ?? process.cwd();

  // Verify root exists
  try {
    await fs.access(projectRoot);
  } catch {
    throw new Error(`Directory does not exist: ${projectRoot}`);
  }

  // 1. Check .deepl-i18n.json config override
  const configPath = path.join(projectRoot, '.deepl-i18n.json');
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(raw) as I18nProjectConfig;
    if (config.framework) {
      const rule = FRAMEWORK_RULES.find(r => r.name === config.framework);
      return {
        name: config.framework,
        interpolation: rule?.interpolation ?? [],
        configFile: configPath,
        localeDir: rule?.localeDir,
        source: 'config',
      };
    }
  } catch {
    // No config file or invalid — continue detection
  }

  // 2. Check framework rules in order
  for (const rule of FRAMEWORK_RULES) {
    const depPath = path.join(projectRoot, rule.depFile);
    let matched = false;

    if (rule.depFile === 'package.json') {
      matched = await checkPackageJson(depPath, rule.packages);
    } else {
      matched = await checkTextFile(depPath, rule.packages);
    }

    if (matched) {
      let configFile: string | undefined;
      if (rule.configFiles) {
        for (const cf of rule.configFiles) {
          const cfPath = path.join(projectRoot, cf);
          try {
            await fs.access(cfPath);
            configFile = cfPath;
            break;
          } catch {
            // Config file not found
          }
        }
      }

      return {
        name: rule.name,
        interpolation: rule.interpolation,
        configFile,
        localeDir: rule.localeDir,
        source: 'detection',
      };
    }
  }

  // 3. Check for Android (strings.xml)
  if (await findFile(projectRoot, (rel) => rel.endsWith(path.join('res', 'values', 'strings.xml')))) {
    return {
      name: 'android',
      interpolation: ['%s', '%d', '%1$s'],
      localeDir: 'app/src/main/res/values/',
      source: 'detection',
    };
  }

  // 4. Check for iOS (Localizable.strings)
  if (await findFile(projectRoot, (rel) => /\.lproj[/\\]Localizable\.strings$/.test(rel))) {
    return {
      name: 'ios',
      interpolation: ['%@', '%d', '%1$@'],
      localeDir: '*.lproj/',
      source: 'detection',
    };
  }

  // 5. Generic fallback
  return {
    name: 'generic',
    interpolation: [],
    source: 'detection',
  };
}

function formatText(result: DetectedFramework): string {
  const lines = [
    `Framework: ${result.name}`,
    `Source: ${result.source}`,
    `Interpolation: ${result.interpolation.length > 0 ? result.interpolation.join(', ') : 'none'}`,
    `Config file: ${result.configFile ?? 'none'}`,
    `Locale directory: ${result.localeDir ?? 'unknown'}`,
  ];
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let root: string | undefined;
  let format: 'json' | 'text' = 'text';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) {
      root = args[i + 1];
      i++;
    } else if (args[i] === '--format' && args[i + 1]) {
      format = args[i + 1] as 'json' | 'text';
      i++;
    }
  }

  const result = await detectFramework(root);

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatText(result));
  }
}

const isDirectRun = process.argv[1]?.endsWith('detect-framework.ts') || process.argv[1]?.endsWith('detect-framework.js');
if (isDirectRun) {
  main().catch((err: Error) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
