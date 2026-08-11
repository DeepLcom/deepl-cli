import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ResolvedPaths {
  configDir: string;
  configFile: string;
  cacheDir: string;
  cacheFile: string;
}

/**
 * Resolve `absPath` through any symlinks in it, tolerating a path that does not
 * exist yet.
 *
 * Containment checks compare resolved strings, so two paths that reach the same
 * inode through different symlink chains (`/tmp` vs `/private/tmp` on macOS)
 * would otherwise compare as different. `fs.realpathSync` only works on paths
 * that already exist, so this walks up to the closest existing ancestor,
 * realpaths that, and re-appends the unresolved tail. If nothing on the path
 * exists — a missing volume — it falls back to the lexically resolved form.
 */
export function realpathOrAncestor(absPath: string): string {
  let current = path.resolve(absPath);
  const tail: string[] = [];
  while (true) {
    try {
      const real = fs.realpathSync(current);
      return tail.length > 0 ? path.join(real, ...tail) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return path.resolve(absPath);
      }
      tail.unshift(path.basename(current));
      current = parent;
    }
  }
}

/**
 * A comparison key for a file path: symlinked ancestors resolved, the final
 * component left exactly as given.
 *
 * Two spellings of one file — the path a user typed and the path a tool such as
 * git reports — must compare equal, which requires resolving the directories
 * they reach the file through. The last component is deliberately not resolved:
 * a symlink that is itself the tracked file is a different file from its
 * target, and resolving it would make the two stop matching.
 */
export function canonicalPathKey(absPath: string): string {
  const resolved = path.resolve(absPath);

  // Where the file exists, its device + inode pair IS its identity, and that is
  // what makes two spellings of one file compare equal. The string form cannot:
  // `fs.realpathSync` does not case-fold on a case-insensitive volume (APFS
  // returns `Docs` for `Docs` even when the directory is stored as `docs`) and
  // does not unify NFC with NFD, so on APFS two paths reaching the same inode can
  // still produce different strings.
  //
  // `lstat`, not `stat`: a symlink has its own inode, which keeps the rule below
  // that a symlink is a different file from its target. On a case-SENSITIVE
  // volume the other spelling simply does not exist, so the two paths keep
  // distinct keys — no platform guesswork in either direction.
  //
  // Callers only ever compare these keys with each other (`Set.has`, map keys),
  // never treat one as a path, so an opaque key is safe. A path with no file yet
  // has no inode and falls back to the resolved string.
  try {
    const stat = fs.lstatSync(resolved);
    return `inode:${stat.dev}:${stat.ino}`;
  } catch {
    return path.join(
      realpathOrAncestor(path.dirname(resolved)),
      path.basename(resolved)
    );
  }
}

/**
 * Whether `target` is `root` itself or lies beneath it, with both sides
 * resolved through their symlinks first — so a symlink inside `root` that
 * points outside it is not counted as contained.
 */
export function isWithinDirectory(root: string, target: string): boolean {
  const resolvedRoot = realpathOrAncestor(root);
  const resolvedTarget = realpathOrAncestor(target);
  return (
    resolvedTarget === resolvedRoot ||
    resolvedTarget.startsWith(resolvedRoot + path.sep)
  );
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

  // 3. XDG env vars / defaults (empty string = unset per XDG spec)
  /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- an empty
     value counts as unset per the XDG spec, which `??` would pass through */
  const xdgConfigHome =
    process.env['XDG_CONFIG_HOME'] || path.join(home, '.config');
  const xdgCacheHome =
    process.env['XDG_CACHE_HOME'] || path.join(home, '.cache');
  /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */

  const configDir = path.join(xdgConfigHome, 'deepl-cli');
  const cacheDir = path.join(xdgCacheHome, 'deepl-cli');

  return {
    configDir,
    configFile: path.join(configDir, 'config.json'),
    cacheDir,
    cacheFile: path.join(cacheDir, 'cache.db'),
  };
}
