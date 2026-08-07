/**
 * Git Hooks Service
 * Manages git hooks installation and configuration for translation workflow
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import { ValidationError } from '../utils/errors.js';
import { isWithinDirectory } from '../utils/paths.js';
import { sanitizeForTerminal } from '../utils/control-chars.js';

export type HookType = 'pre-commit' | 'pre-push' | 'commit-msg' | 'post-commit';

export interface HookStatus {
  [key: string]: boolean;
}

export interface InstallResult {
  hookPath: string;
  /** Path the pre-existing non-DeepL hook was copied to, or null if nothing was backed up. */
  backupPath: string | null;
}

const MAX_BACKUP_SLOTS = 100;

export interface HookIntegrity {
  installed: boolean;
  markerVersion: null | 'legacy' | 1;
  hashMatch: boolean | null;
  expectedHash: string | null;
  actualHash: string | null;
}

const MARKER_VERSION = 1;
const LEGACY_MARKER = '# DeepL CLI Hook';
const MARKER_PATTERN = /^# DeepL CLI Hook v(\d+) \[sha256:([a-f0-9]{64})\]$/m;

interface HooksDirResolution {
  dir: string;
  /** The `core.hooksPath` that sent `dir` outside the working tree, or null. */
  externalRedirect: string | null;
}

/**
 * One wording for the refusal and for the prompt that offers to go ahead, so
 * the two cannot drift. The configured value comes from the checkout, so it is
 * terminal-sanitized before it is interpolated.
 */
export function externalHooksPathMessage(
  configured: string,
  hooksDir: string
): string {
  return (
    `This repository's core.hooksPath ("${sanitizeForTerminal(configured)}") puts git hooks outside the working tree, ` +
    `at ${sanitizeForTerminal(hooksDir)}. Installing writes an executable there, and git runs it on every matching operation in this repository.`
  );
}

export class GitHooksService {
  private hooksDir: string;
  private externalRedirect: string | null;

  constructor(gitDir: string) {
    if (!fs.existsSync(gitDir)) {
      throw new ValidationError('Git directory not found: ' + gitDir);
    }

    const resolution = GitHooksService.resolveHooksDir(gitDir);
    this.hooksDir = resolution.dir;
    this.externalRedirect = resolution.externalRedirect;
  }

  /**
   * The repository-local `core.hooksPath` when it sends the hooks directory
   * outside the working tree, or null. Non-null means installing writes an
   * executable to a location the checkout chose rather than the user did.
   */
  get externalHooksPath(): string | null {
    return this.externalRedirect;
  }

  get hooksDirectory(): string {
    return this.hooksDir;
  }

  /**
   * Resolve the directory git actually reads hooks from.
   *
   * `git rev-parse --git-path hooks` honours core.hooksPath (husky and friends)
   * and resolves the `gitdir:` pointer used by linked worktrees and submodules,
   * where `<root>/.git` is a file rather than a directory.
   */
  private static resolveHooksDir(gitDir: string): HooksDirResolution {
    const workDir = path.dirname(gitDir);

    try {
      const resolved = execFileSync(
        'git',
        ['rev-parse', '--git-path', 'hooks'],
        {
          cwd: workDir,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      ).trim();
      if (resolved) {
        const dir = path.resolve(workDir, resolved);
        return {
          dir,
          externalRedirect: GitHooksService.externalRedirectFor(workDir, dir),
        };
      }
    } catch {
      // git unavailable, or workDir is not a working tree — fall back below.
    }

    if (!fs.statSync(gitDir).isDirectory()) {
      throw new ValidationError(
        `Cannot resolve the hooks directory for "${gitDir}": it is a gitdir pointer file and git is not available to resolve it.`,
        'Install git, or run this command from the repository that owns the worktree.'
      );
    }

    return { dir: path.join(gitDir, 'hooks'), externalRedirect: null };
  }

  /**
   * The configured `core.hooksPath` when the directory it resolves to lies
   * outside the working tree.
   *
   * Only the repository-local setting is consulted, for two reasons. It is the
   * one an untrusted checkout can carry, which is the case worth confirming —
   * a global setting is the user's own machine-wide choice. And a repository
   * that sets nothing is never reported, which is what keeps linked worktrees
   * and submodules quiet: there `--git-path hooks` legitimately answers with
   * the hooks directory of the repository that owns them, which is outside
   * this working tree by design.
   */
  private static externalRedirectFor(
    workDir: string,
    hooksDir: string
  ): string | null {
    let configured: string;
    try {
      configured = execFileSync(
        'git',
        ['config', '--local', '--get', 'core.hooksPath'],
        { cwd: workDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();
    } catch {
      // Exit status 1 means the key is not set.
      return null;
    }

    if (!configured) return null;
    return isWithinDirectory(workDir, hooksDir) ? null : configured;
  }

  /**
   * Install a git hook
   */
  install(
    hookType: HookType,
    options: { allowExternal?: boolean } = {}
  ): InstallResult {
    this.validateHookType(hookType);
    if (this.externalRedirect !== null && options.allowExternal !== true) {
      throw new ValidationError(
        externalHooksPathMessage(this.externalRedirect, this.hooksDir),
        'Pass --yes to install there anyway, or drop the redirect with: git config --unset core.hooksPath'
      );
    }

    const hookPath = this.getHookPath(hookType);
    const hookContent = this.generateHookContent(hookType);

    // Create hooks directory if it doesn't exist
    if (!fs.existsSync(this.hooksDir)) {
      fs.mkdirSync(this.hooksDir, { recursive: true });
    }

    // Backup existing hook if it exists and is not a DeepL hook
    let backupPath: string | null = null;
    if (fs.existsSync(hookPath)) {
      const existingContent = fs.readFileSync(hookPath, 'utf-8');
      if (!this.isDeepLHook(existingContent)) {
        backupPath = GitHooksService.nextBackupPath(hookPath);
        fs.copyFileSync(hookPath, backupPath);
      }
    }

    // Write the hook file
    fs.writeFileSync(hookPath, hookContent, 'utf-8');

    // Make it executable
    fs.chmodSync(hookPath, 0o755);

    return { hookPath, backupPath };
  }

  /**
   * Pick a backup path that does not already exist, so a repeat install after
   * another tool rewrote the hook cannot destroy the first backup.
   */
  private static nextBackupPath(hookPath: string): string {
    const primary = hookPath + '.backup';
    if (!fs.existsSync(primary)) {
      return primary;
    }
    for (let slot = 1; slot < MAX_BACKUP_SLOTS; slot++) {
      const candidate = `${primary}.${slot}`;
      if (!fs.existsSync(candidate)) {
        return candidate;
      }
    }
    throw new ValidationError(
      `Refusing to install: ${MAX_BACKUP_SLOTS} backups of "${path.basename(hookPath)}" already exist.`,
      `Remove the unneeded ${path.basename(primary)}* files and retry.`
    );
  }

  /**
   * Uninstall a git hook
   */
  uninstall(hookType: HookType): void {
    this.validateHookType(hookType);

    const hookPath = this.getHookPath(hookType);

    if (!fs.existsSync(hookPath)) {
      return;
    }

    // Verify it's a DeepL hook before removing
    const content = fs.readFileSync(hookPath, 'utf-8');
    if (!this.isDeepLHook(content)) {
      throw new ValidationError(
        'Hook is not a DeepL CLI hook. Remove it manually if needed.'
      );
    }

    fs.unlinkSync(hookPath);

    // Restore backup if it exists
    const backupPath = hookPath + '.backup';
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, hookPath);
      fs.unlinkSync(backupPath);
    }
  }

  /**
   * Check if a hook is installed
   */
  isInstalled(hookType: HookType): boolean {
    this.validateHookType(hookType);

    const hookPath = this.getHookPath(hookType);

    if (!fs.existsSync(hookPath)) {
      return false;
    }

    const content = fs.readFileSync(hookPath, 'utf-8');
    return this.isDeepLHook(content);
  }

  /**
   * List all hooks and their installation status
   */
  list(): HookStatus {
    const hooks: HookType[] = [
      'pre-commit',
      'pre-push',
      'commit-msg',
      'post-commit',
    ];
    const status: HookStatus = {};

    for (const hook of hooks) {
      status[hook] = this.isInstalled(hook);
    }

    return status;
  }

  /**
   * Get the full path to a hook file
   */
  getHookPath(hookType: HookType): string {
    this.validateHookType(hookType);
    return path.join(this.hooksDir, hookType);
  }

  /**
   * Find git root directory from current path
   */
  static findGitRoot(startPath?: string): string | null {
    // Resolve first: path.dirname() of a relative path bottoms out at '.',
    // which never equals path.parse().root and loops forever.
    let currentPath = path.resolve(startPath ?? process.cwd());

    // Traverse up the directory tree
    while (currentPath !== path.parse(currentPath).root) {
      const gitPath = path.join(currentPath, '.git');
      if (fs.existsSync(gitPath)) {
        return gitPath;
      }
      currentPath = path.dirname(currentPath);
    }

    return null;
  }

  /**
   * Verify the integrity of an installed hook by checking its hash
   */
  verifyIntegrity(hookType: HookType): HookIntegrity {
    this.validateHookType(hookType);

    const hookPath = this.getHookPath(hookType);

    if (!fs.existsSync(hookPath)) {
      return {
        installed: false,
        markerVersion: null,
        hashMatch: null,
        expectedHash: null,
        actualHash: null,
      };
    }

    const content = fs.readFileSync(hookPath, 'utf-8');

    if (!this.isDeepLHook(content)) {
      return {
        installed: false,
        markerVersion: null,
        hashMatch: null,
        expectedHash: null,
        actualHash: null,
      };
    }

    const markerMatch = content.match(MARKER_PATTERN);

    if (!markerMatch) {
      if (content.includes(LEGACY_MARKER)) {
        return {
          installed: true,
          markerVersion: 'legacy',
          hashMatch: null,
          expectedHash: null,
          actualHash: null,
        };
      }
      return {
        installed: false,
        markerVersion: null,
        hashMatch: null,
        expectedHash: null,
        actualHash: null,
      };
    }

    const expectedHash = markerMatch[2]!;
    const body = GitHooksService.extractHookBody(content);
    const actualHash = GitHooksService.computeHash(body);

    return {
      installed: true,
      markerVersion: Number(markerMatch[1]) as 1,
      hashMatch: expectedHash === actualHash,
      expectedHash,
      actualHash,
    };
  }

  /**
   * Compute SHA-256 hash of content
   */
  static computeHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  /**
   * Extract the hook body (everything after the marker line)
   */
  static extractHookBody(content: string): string {
    const lines = content.split('\n');
    const markerIndex = lines.findIndex(
      (line) => MARKER_PATTERN.test(line) || line === LEGACY_MARKER
    );
    if (markerIndex === -1) {
      return content;
    }
    return lines.slice(markerIndex + 1).join('\n');
  }

  /**
   * Generate hook script content
   */
  private generateHookContent(hookType: HookType): string {
    const body = this.generateHookBody(hookType);
    const hash = GitHooksService.computeHash(body);
    return `#!/bin/sh\n# DeepL CLI Hook v${MARKER_VERSION} [sha256:${hash}]\n${body}`;
  }

  /**
   * Generate hook body (everything after the marker line)
   */
  private generateHookBody(hookType: HookType): string {
    const commonPreamble = `# Generated by DeepL CLI - DO NOT EDIT MANUALLY
# To uninstall: deepl hooks uninstall ${hookType}

`;

    if (hookType === 'pre-commit') {
      return (
        commonPreamble +
        `# Pre-commit hook for DeepL CLI
# Validates translations before committing

# Check if deepl CLI is available
if ! command -v deepl >/dev/null 2>&1; then
  echo "⚠️  DeepL CLI not found in PATH, skipping translation validation"
  exit 0
fi

# Only projects with a sync config have translations to validate
if [ ! -f ".deepl-sync.yaml" ]; then
  echo "✓ No .deepl-sync.yaml found, skipping translation validation"
  exit 0
fi

echo "🔍 Validating translations..."

if ! deepl sync validate; then
  echo "✗ Translation validation failed. Fix the issues above, or commit with --no-verify to skip."
  exit 1
fi

echo "✓ Translation validation passed"
exit 0
`
      );
    } else if (hookType === 'pre-push') {
      return (
        commonPreamble +
        `# Pre-push hook for DeepL CLI
# Validates all translations before pushing

echo "🔍 Validating all translations before push..."

# Check if deepl CLI is available
if ! command -v deepl &> /dev/null; then
  echo "⚠️  DeepL CLI not found in PATH"
  echo "   Install: npm install -g @deepl/cli"
  exit 0
fi

# You can add custom validation logic here
# For example:
# - Check if all .md files have corresponding translations
# - Validate translation files are not stale
# - Run translation validation command

echo "✓ Translation validation passed"
exit 0
`
      );
    } else if (hookType === 'commit-msg') {
      return (
        commonPreamble +
        `# Commit message hook for DeepL CLI
# Validates commit messages follow Conventional Commits format

COMMIT_MSG_FILE=$1

# Check if commitlint is available
if ! command -v npx &> /dev/null; then
  echo "⚠️  npx not found, skipping commit message validation"
  exit 0
fi

# Check if commitlint is installed in the project
if [ ! -f "$(pwd)/node_modules/.bin/commitlint" ] && [ ! -f "$(pwd)/commitlint.config.js" ]; then
  echo "⚠️  commitlint not configured, skipping validation"
  exit 0
fi

# Run commitlint
npx --no -- commitlint --edit "$COMMIT_MSG_FILE"

# Exit with commitlint's exit code
exit $?
`
      );
    } else if (hookType === 'post-commit') {
      return (
        commonPreamble +
        `# Post-commit hook for DeepL CLI
# Provides feedback and automation after successful commits

# Get the commit message and hash
COMMIT_HASH=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --pretty=%B)
COMMIT_TYPE=$(echo "$COMMIT_MSG" | head -1 | grep --color=never -oE '^[a-z]+' || echo "unknown")

echo "✅ Commit successful: $COMMIT_HASH"

# Provide type-specific feedback
case "$COMMIT_TYPE" in
  feat)
    echo "📦 Feature added - consider updating CHANGELOG.md"
    ;;
  fix)
    echo "🐛 Bug fix - consider updating CHANGELOG.md"
    ;;
  docs)
    echo "📝 Documentation updated"
    ;;
  test)
    echo "🧪 Tests updated"
    ;;
  refactor)
    echo "♻️  Code refactored"
    ;;
  perf)
    echo "⚡ Performance improved"
    ;;
  chore)
    echo "🔧 Maintenance completed"
    ;;
esac

# Check if this is a feature or fix that should be documented
if [ "$COMMIT_TYPE" = "feat" ] || [ "$COMMIT_TYPE" = "fix" ]; then
  if ! grep -q "## \\[Unreleased\\]" CHANGELOG.md 2>/dev/null; then
    echo "💡 Tip: Update CHANGELOG.md with user-facing changes"
  fi
fi

exit 0
`
      );
    }

    const validTypes: HookType[] = [
      'pre-commit',
      'pre-push',
      'commit-msg',
      'post-commit',
    ];
    throw new ValidationError(
      `Invalid hook type: ${hookType}. Must be one of: ${validTypes.join(', ')}`
    );
  }

  /**
   * Check if content is a DeepL CLI hook (supports both legacy and versioned markers)
   */
  private isDeepLHook(content: string): boolean {
    return MARKER_PATTERN.test(content) || content.includes(LEGACY_MARKER);
  }

  /**
   * Validate hook type
   */
  private validateHookType(hookType: string): asserts hookType is HookType {
    const validTypes: HookType[] = [
      'pre-commit',
      'pre-push',
      'commit-msg',
      'post-commit',
    ];
    if (!validTypes.includes(hookType as HookType)) {
      throw new ValidationError(
        `Invalid hook type: ${hookType}. Must be one of: ${validTypes.join(', ')}`
      );
    }
  }
}
