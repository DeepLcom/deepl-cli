/**
 * Integration Tests for Git Hooks Service
 * Tests git hooks installation, uninstallation, and management
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GitHooksService, HookType } from '../../src/services/git-hooks.js';

describe('Git Hooks Service Integration', () => {
  let tmpGitDir: string;
  let hooksService: GitHooksService;

  beforeEach(() => {
    // Create temp .git directory
    tmpGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-git-test-'));
    const gitDir = path.join(tmpGitDir, '.git');
    fs.mkdirSync(gitDir);

    hooksService = new GitHooksService(gitDir);
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tmpGitDir)) {
      fs.rmSync(tmpGitDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create service with valid git directory', () => {
      const gitDir = path.join(tmpGitDir, '.git');
      const service = new GitHooksService(gitDir);
      expect(service).toBeInstanceOf(GitHooksService);
    });

    it('should throw error for non-existent git directory', () => {
      expect(() => {
        new GitHooksService('/nonexistent/git/dir');
      }).toThrow('Git directory not found');
    });
  });

  describe('install()', () => {
    it('should install pre-commit hook', () => {
      hooksService.install('pre-commit');

      const hookPath = hooksService.getHookPath('pre-commit');
      expect(fs.existsSync(hookPath)).toBe(true);

      const content = fs.readFileSync(hookPath, 'utf-8');
      expect(content).toContain('#!/bin/sh');
      expect(content).toMatch(/# DeepL CLI Hook v1 \[sha256:[a-f0-9]{64}\]/);
      expect(content).toContain('pre-commit');
    });

    it('should install pre-push hook', () => {
      hooksService.install('pre-push');

      const hookPath = hooksService.getHookPath('pre-push');
      expect(fs.existsSync(hookPath)).toBe(true);

      const content = fs.readFileSync(hookPath, 'utf-8');
      expect(content).toContain('pre-push');
    });

    it('should install commit-msg hook', () => {
      hooksService.install('commit-msg');

      const hookPath = hooksService.getHookPath('commit-msg');
      expect(fs.existsSync(hookPath)).toBe(true);
    });

    it('should install post-commit hook', () => {
      hooksService.install('post-commit');

      const hookPath = hooksService.getHookPath('post-commit');
      expect(fs.existsSync(hookPath)).toBe(true);
    });

    it('should make hook file executable', () => {
      hooksService.install('pre-commit');

      const hookPath = hooksService.getHookPath('pre-commit');
      const stats = fs.statSync(hookPath);

      // Check if file is executable (mode includes execute permission)
      expect((stats.mode & 0o111) !== 0).toBe(true);
    });

    it('should backup existing non-DeepL hook', () => {
      const hookPath = hooksService.getHookPath('pre-commit');
      fs.mkdirSync(path.dirname(hookPath), { recursive: true });
      fs.writeFileSync(hookPath, '#!/bin/sh\necho "Custom hook"', 'utf-8');

      hooksService.install('pre-commit');

      const backupPath = hookPath + '.backup';
      expect(fs.existsSync(backupPath)).toBe(true);

      const backupContent = fs.readFileSync(backupPath, 'utf-8');
      expect(backupContent).toContain('Custom hook');
    });

    it('should not backup existing DeepL hook', () => {
      hooksService.install('pre-commit');
      hooksService.install('pre-commit'); // Install again

      const hookPath = hooksService.getHookPath('pre-commit');
      const backupPath = hookPath + '.backup';

      // Backup should not exist since existing hook was DeepL hook
      expect(fs.existsSync(backupPath)).toBe(false);
    });

    it('should throw error for invalid hook type', () => {
      expect(() => {
        hooksService.install('invalid-hook' as HookType);
      }).toThrow('Invalid hook type');
    });
  });

  describe('uninstall()', () => {
    beforeEach(() => {
      // Install a hook for uninstall tests
      hooksService.install('pre-commit');
    });

    it('should uninstall DeepL hook', () => {
      const hookPath = hooksService.getHookPath('pre-commit');
      expect(fs.existsSync(hookPath)).toBe(true);

      hooksService.uninstall('pre-commit');

      expect(fs.existsSync(hookPath)).toBe(false);
    });

    it('should restore backup after uninstall', () => {
      // Create custom hook first
      const hookPath = hooksService.getHookPath('pre-push');
      fs.mkdirSync(path.dirname(hookPath), { recursive: true });
      fs.writeFileSync(hookPath, '#!/bin/sh\necho "Original"', 'utf-8');

      // Install DeepL hook (will backup original)
      hooksService.install('pre-push');

      // Uninstall (should restore original)
      hooksService.uninstall('pre-push');

      expect(fs.existsSync(hookPath)).toBe(true);
      const content = fs.readFileSync(hookPath, 'utf-8');
      expect(content).toContain('Original');
    });

    it('should not throw error when uninstalling non-existent hook', () => {
      hooksService.uninstall('post-commit'); // Not installed
      expect(true).toBe(true); // Test passes without error
    });

    it('should throw error when uninstalling non-DeepL hook', () => {
      const hookPath = hooksService.getHookPath('pre-push');
      fs.mkdirSync(path.dirname(hookPath), { recursive: true });
      fs.writeFileSync(hookPath, '#!/bin/sh\necho "Custom"', 'utf-8');

      expect(() => {
        hooksService.uninstall('pre-push');
      }).toThrow('not a DeepL CLI hook');
    });

    it('should throw error for invalid hook type', () => {
      expect(() => {
        hooksService.uninstall('invalid-hook' as HookType);
      }).toThrow('Invalid hook type');
    });
  });

  describe('isInstalled()', () => {
    it('should return false when hook not installed', () => {
      expect(hooksService.isInstalled('pre-commit')).toBe(false);
    });

    it('should return true when DeepL hook installed', () => {
      hooksService.install('pre-commit');
      expect(hooksService.isInstalled('pre-commit')).toBe(true);
    });

    it('should return false for non-DeepL hook', () => {
      const hookPath = hooksService.getHookPath('pre-commit');
      fs.mkdirSync(path.dirname(hookPath), { recursive: true });
      fs.writeFileSync(hookPath, '#!/bin/sh\necho "Custom"', 'utf-8');

      expect(hooksService.isInstalled('pre-commit')).toBe(false);
    });

    it('should throw error for invalid hook type', () => {
      expect(() => {
        hooksService.isInstalled('invalid-hook' as HookType);
      }).toThrow('Invalid hook type');
    });
  });

  describe('list()', () => {
    it('should list all hooks as not installed initially', () => {
      const status = hooksService.list();

      expect(status['pre-commit']).toBe(false);
      expect(status['pre-push']).toBe(false);
      expect(status['commit-msg']).toBe(false);
      expect(status['post-commit']).toBe(false);
    });

    it('should show installed hooks', () => {
      hooksService.install('pre-commit');
      hooksService.install('pre-push');

      const status = hooksService.list();

      expect(status['pre-commit']).toBe(true);
      expect(status['pre-push']).toBe(true);
      expect(status['commit-msg']).toBe(false);
      expect(status['post-commit']).toBe(false);
    });

    it('should not show non-DeepL hooks as installed', () => {
      const hookPath = hooksService.getHookPath('pre-commit');
      fs.mkdirSync(path.dirname(hookPath), { recursive: true });
      fs.writeFileSync(hookPath, '#!/bin/sh\necho "Custom"', 'utf-8');

      const status = hooksService.list();
      expect(status['pre-commit']).toBe(false);
    });
  });

  describe('getHookPath()', () => {
    it('should return correct path for pre-commit', () => {
      const hookPath = hooksService.getHookPath('pre-commit');
      expect(hookPath).toContain('hooks');
      expect(hookPath).toContain('pre-commit');
    });

    it('should return correct path for all hook types', () => {
      const hookTypes: HookType[] = ['pre-commit', 'pre-push', 'commit-msg', 'post-commit'];

      for (const hookType of hookTypes) {
        const hookPath = hooksService.getHookPath(hookType);
        expect(hookPath).toContain(hookType);
      }
    });

    it('should throw error for invalid hook type', () => {
      expect(() => {
        hooksService.getHookPath('invalid-hook' as HookType);
      }).toThrow('Invalid hook type');
    });
  });

  describe('GitHooksService.findGitRoot()', () => {
    it('should find .git directory in current path', () => {
      const gitRoot = GitHooksService.findGitRoot(tmpGitDir);
      expect(gitRoot).toBe(path.join(tmpGitDir, '.git'));
    });

    it('should find .git directory in parent path', () => {
      const subDir = path.join(tmpGitDir, 'subdir', 'nested');
      fs.mkdirSync(subDir, { recursive: true });

      const gitRoot = GitHooksService.findGitRoot(subDir);
      expect(gitRoot).toBe(path.join(tmpGitDir, '.git'));
    });

    it('should return null when no .git directory found', () => {
      const tmpWithoutGit = fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-'));

      const gitRoot = GitHooksService.findGitRoot(tmpWithoutGit);
      expect(gitRoot).toBeNull();

      fs.rmSync(tmpWithoutGit, { recursive: true, force: true });
    });

    it('should use process.cwd() when startPath not provided', () => {
      const gitRoot = GitHooksService.findGitRoot();
      // Should find the git root of the test project itself
      expect(gitRoot).toBeTruthy();
    });
  });
});
