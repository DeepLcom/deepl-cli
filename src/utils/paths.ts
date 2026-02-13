import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ResolvedPaths {
  configDir: string;
  configFile: string;
  cacheDir: string;
  cacheFile: string;
}

export function resolvePaths(): ResolvedPaths {
  const home = os.homedir();

  // 1. DEEPL_CONFIG_DIR env var (highest priority)
  const configDirEnv = process.env['DEEPL_CONFIG_DIR'];
  if (configDirEnv) {
    return {
      configDir: configDirEnv,
      configFile: path.join(configDirEnv, 'config.json'),
      cacheDir: configDirEnv,
      cacheFile: path.join(configDirEnv, 'cache.db'),
    };
  }

  // 2. Legacy ~/.deepl-cli/ exists on disk
  const legacyDir = path.join(home, '.deepl-cli');
  if (fs.existsSync(legacyDir)) {
    return {
      configDir: legacyDir,
      configFile: path.join(legacyDir, 'config.json'),
      cacheDir: legacyDir,
      cacheFile: path.join(legacyDir, 'cache.db'),
    };
  }

  // 3. XDG env vars / defaults
  const xdgConfigHome = process.env['XDG_CONFIG_HOME']
    ? process.env['XDG_CONFIG_HOME']
    : path.join(home, '.config');
  const xdgCacheHome = process.env['XDG_CACHE_HOME']
    ? process.env['XDG_CACHE_HOME']
    : path.join(home, '.cache');

  const configDir = path.join(xdgConfigHome, 'deepl-cli');
  const cacheDir = path.join(xdgCacheHome, 'deepl-cli');

  return {
    configDir,
    configFile: path.join(configDir, 'config.json'),
    cacheDir,
    cacheFile: path.join(cacheDir, 'cache.db'),
  };
}
