/**
 * Hooks Command
 * Manages git hooks for translation workflow
 */

import chalk from 'chalk';
import {
  GitHooksService,
  HookState,
  HookType,
} from '../../services/git-hooks.js';
import { ValidationError } from '../../utils/errors.js';

const HOOK_STATE_DISPLAY: Record<HookState, { icon: string; text: string }> = {
  installed: { icon: chalk.green('✓'), text: chalk.green('installed') },
  unverified: {
    icon: chalk.yellow('?'),
    text: chalk.yellow('installed, no hash recorded (legacy marker)'),
  },
  modified: {
    icon: chalk.yellow('!'),
    text: chalk.yellow('installed, content does not match its recorded hash'),
  },
  'not-installed': { icon: chalk.gray('✗'), text: chalk.gray('not installed') },
};

/**
 * A mismatch has two readings the CLI cannot tell apart — a hook the user
 * customized, which the documentation invites, and content this CLI never
 * wrote — so the note gives both rather than accusing either way.
 */
const MISMATCH_NOTE = [
  'The content of a hook no longer matches the hash its marker records. That',
  'is expected if you edited the hook yourself. If you did not, replace it:',
  '  deepl hooks install <hook-type>',
];

/**
 * The hash is unkeyed, so a matching one is not evidence of authorship: anyone
 * who can write the hook can write a marker that agrees with it.
 */
const AUTHORSHIP_NOTE = [
  'A recorded hash detects a change made after the marker was written. It',
  'cannot establish that a hook came from this CLI.',
];

export class HooksCommand {
  private gitHooksService: GitHooksService | null = null;

  constructor(gitDir?: string) {
    // Find git directory if not provided
    const gitDirectory = gitDir ?? GitHooksService.findGitRoot();

    if (!gitDirectory) {
      this.gitHooksService = null;
    } else {
      this.gitHooksService = new GitHooksService(gitDirectory);
    }
  }

  /**
   * Install a git hook
   */
  /**
   * The `core.hooksPath` this repository uses to send hooks outside the working
   * tree, or null. The CLI asks before writing there; `install` refuses on its
   * own if nobody did.
   */
  externalHooksPath(): string | null {
    return this.gitHooksService?.externalHooksPath ?? null;
  }

  hooksDirectory(): string | null {
    return this.gitHooksService?.hooksDirectory ?? null;
  }

  install(
    hookType: HookType,
    options: { allowExternal?: boolean } = {}
  ): string {
    if (!this.gitHooksService) {
      throw new ValidationError(
        'Not in a git repository. Run this command from within a git repository.'
      );
    }

    const result = this.gitHooksService.install(hookType, options);

    const lines = [chalk.green(`✓ Installed ${hookType} hook`)];
    if (result?.hookPath) {
      lines.push(chalk.gray(`  Path: ${result.hookPath}`));
    }
    if (result?.backupPath) {
      lines.push(
        chalk.gray(`  Previous hook backed up to: ${result.backupPath}`)
      );
    }

    return lines.join('\n');
  }

  /**
   * Uninstall a git hook
   */
  uninstall(hookType: HookType): string {
    if (!this.gitHooksService) {
      throw new ValidationError(
        'Not in a git repository. Run this command from within a git repository.'
      );
    }

    this.gitHooksService.uninstall(hookType);

    return chalk.green(`✓ Uninstalled ${hookType} hook`);
  }

  /**
   * Return raw hook status data (for JSON output)
   */
  listData(): Record<string, HookState> {
    if (!this.gitHooksService) {
      return {};
    }
    return this.gitHooksService.list();
  }

  /**
   * List all hooks and their status
   */
  list(): string {
    if (!this.gitHooksService) {
      return chalk.yellow('⚠️  Not in a git repository');
    }

    const status = this.gitHooksService.list();
    const lines = ['Git Hooks Status:', ''];

    for (const [hook, state] of Object.entries(status)) {
      const { icon, text } = HOOK_STATE_DISPLAY[state];
      lines.push(`  ${icon} ${hook.padEnd(15)} ${text}`);
    }

    const states = Object.values(status);
    const notes: string[] = [];
    if (states.includes('modified')) {
      notes.push(...MISMATCH_NOTE);
    }
    if (states.includes('modified') || states.includes('unverified')) {
      notes.push(...AUTHORSHIP_NOTE);
    }
    if (notes.length > 0) {
      lines.push('', ...notes.map((note) => chalk.gray(note)));
    }

    return lines.join('\n');
  }

  /**
   * Show hook path
   */
  showPath(hookType: HookType): string {
    if (!this.gitHooksService) {
      throw new ValidationError(
        'Not in a git repository. Run this command from within a git repository.'
      );
    }

    const hookPath = this.gitHooksService.getHookPath(hookType);
    return chalk.blue(`Hook path: ${hookPath}`);
  }
}
