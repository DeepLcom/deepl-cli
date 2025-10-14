/**
 * Tests for GitHooksService
 * Following TDD approach
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GitHooksService } from '../../../src/services/git-hooks';

describe('GitHooksService', () => {
  let testGitDir: string;
  let testHooksDir: string;
  let gitHooksService: GitHooksService;

  beforeEach(() => {
    // Create temporary .git directory for testing
    testGitDir = path.join(os.tmpdir(), `.git-test-${Date.now()}`);
    testHooksDir = path.join(testGitDir, 'hooks');

    fs.mkdirSync(testGitDir, { recursive: true });

    gitHooksService = new GitHooksService(testGitDir);
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(testGitDir)) {
      fs.rmSync(testGitDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create GitHooksService with valid git directory', () => {
      expect(gitHooksService).toBeInstanceOf(GitHooksService);
    });

    it('should throw error for non-existent git directory', () => {
      const nonExistentDir = path.join(os.tmpdir(), 'non-existent-git');

      expect(() => new GitHooksService(nonExistentDir)).toThrow('Git directory not found');
    });
  });

  describe('install()', () => {
    it('should install pre-commit hook', () => {
      gitHooksService.install('pre-commit');

      const hookPath = path.join(testHooksDir, 'pre-commit');
      expect(fs.existsSync(hookPath)).toBe(true);

      const content = fs.readFileSync(hookPath, 'utf-8');
      expect(content).toContain('# DeepL CLI Hook');
      expect(content).toContain('pre-commit');
    });

    it('should install pre-push hook', () => {
      gitHooksService.install('pre-push');

      const hookPath = path.join(testHooksDir, 'pre-push');
      expect(fs.existsSync(hookPath)).toBe(true);

      const content = fs.readFileSync(hookPath, 'utf-8');
      expect(content).toContain('# DeepL CLI Hook');
      expect(content).toContain('pre-push');
    });

    it('should install commit-msg hook', () => {
      gitHooksService.install('commit-msg');

      const hookPath = path.join(testHooksDir, 'commit-msg');
      expect(fs.existsSync(hookPath)).toBe(true);

      const content = fs.readFileSync(hookPath, 'utf-8');
      expect(content).toContain('# DeepL CLI Hook');
      expect(content).toContain('commit-msg');
      expect(content).toContain('commitlint');
    });

    it('should install post-commit hook', () => {
      gitHooksService.install('post-commit');

      const hookPath = path.join(testHooksDir, 'post-commit');
      expect(fs.existsSync(hookPath)).toBe(true);

      const content = fs.readFileSync(hookPath, 'utf-8');
      expect(content).toContain('# DeepL CLI Hook');
      expect(content).toContain('post-commit');
      expect(content).toContain('Commit successful');
    });

    it('should make hook file executable', () => {
      gitHooksService.install('pre-commit');

      const hookPath = path.join(testHooksDir, 'pre-commit');
      const stats = fs.statSync(hookPath);

      // Check if file is executable (mode includes execute permission)
      const isExecutable = (stats.mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });

    it('should create hooks directory if it does not exist', () => {
      expect(fs.existsSync(testHooksDir)).toBe(false);

      gitHooksService.install('pre-commit');

      expect(fs.existsSync(testHooksDir)).toBe(true);
    });

    it('should backup existing non-DeepL hook before installing', () => {
      // Create hooks directory
      fs.mkdirSync(testHooksDir, { recursive: true });

      // Write existing hook
      const hookPath = path.join(testHooksDir, 'pre-commit');
      const existingContent = '#!/bin/sh\necho "custom hook"';
      fs.writeFileSync(hookPath, existingContent);

      gitHooksService.install('pre-commit');

      // Check backup was created
      const backupPath = hookPath + '.backup';
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(fs.readFileSync(backupPath, 'utf-8')).toBe(existingContent);

      // Check new hook was installed
      const newContent = fs.readFileSync(hookPath, 'utf-8');
      expect(newContent).toContain('# DeepL CLI Hook');
    });

    it('should not backup existing DeepL hook', () => {
      fs.mkdirSync(testHooksDir, { recursive: true });

      // Install once
      gitHooksService.install('pre-commit');

      // Install again (re-install)
      gitHooksService.install('pre-commit');

      // No backup should be created
      const hookPath = path.join(testHooksDir, 'pre-commit');
      const backupPath = hookPath + '.backup';
      expect(fs.existsSync(backupPath)).toBe(false);
    });

    it('should throw error for invalid hook type', () => {
      expect(() => {
        (gitHooksService as any).install('invalid-hook');
      }).toThrow('Invalid hook type');
    });
  });

  describe('uninstall()', () => {
    beforeEach(() => {
      fs.mkdirSync(testHooksDir, { recursive: true });
    });

    it('should uninstall DeepL hook', () => {
      // Install hook first
      gitHooksService.install('pre-commit');

      const hookPath = path.join(testHooksDir, 'pre-commit');
      expect(fs.existsSync(hookPath)).toBe(true);

      // Uninstall
      gitHooksService.uninstall('pre-commit');

      expect(fs.existsSync(hookPath)).toBe(false);
    });

    it('should restore backup after uninstalling', () => {
      // Create custom hook
      const hookPath = path.join(testHooksDir, 'pre-commit');
      const customContent = '#!/bin/sh\necho "custom"';
      fs.writeFileSync(hookPath, customContent);

      // Install DeepL hook (creates backup)
      gitHooksService.install('pre-commit');

      // Uninstall (should restore backup)
      gitHooksService.uninstall('pre-commit');

      expect(fs.existsSync(hookPath)).toBe(true);
      expect(fs.readFileSync(hookPath, 'utf-8')).toBe(customContent);

      // Backup should be cleaned up
      const backupPath = hookPath + '.backup';
      expect(fs.existsSync(backupPath)).toBe(false);
    });

    it('should not error when uninstalling non-existent hook', () => {
      expect(() => gitHooksService.uninstall('pre-commit')).not.toThrow();
    });

    it('should throw error when trying to uninstall non-DeepL hook', () => {
      // Create custom hook
      const hookPath = path.join(testHooksDir, 'pre-commit');
      fs.writeFileSync(hookPath, '#!/bin/sh\necho "custom"');

      expect(() => gitHooksService.uninstall('pre-commit')).toThrow(
        'Hook is not a DeepL CLI hook'
      );
    });

    it('should throw error for invalid hook type', () => {
      expect(() => {
        (gitHooksService as any).uninstall('invalid-hook');
      }).toThrow('Invalid hook type');
    });
  });

  describe('isInstalled()', () => {
    beforeEach(() => {
      fs.mkdirSync(testHooksDir, { recursive: true });
    });

    it('should return true when DeepL hook is installed', () => {
      gitHooksService.install('pre-commit');

      expect(gitHooksService.isInstalled('pre-commit')).toBe(true);
    });

    it('should return false when hook does not exist', () => {
      expect(gitHooksService.isInstalled('pre-commit')).toBe(false);
    });

    it('should return false when non-DeepL hook exists', () => {
      const hookPath = path.join(testHooksDir, 'pre-commit');
      fs.writeFileSync(hookPath, '#!/bin/sh\necho "custom"');

      expect(gitHooksService.isInstalled('pre-commit')).toBe(false);
    });

    it('should throw error for invalid hook type', () => {
      expect(() => {
        (gitHooksService as any).isInstalled('invalid-hook');
      }).toThrow('Invalid hook type');
    });
  });

  describe('list()', () => {
    beforeEach(() => {
      fs.mkdirSync(testHooksDir, { recursive: true });
    });

    it('should list installation status of all hooks', () => {
      const status = gitHooksService.list();

      expect(status).toHaveProperty('pre-commit');
      expect(status).toHaveProperty('pre-push');
      expect(status).toHaveProperty('commit-msg');
      expect(status).toHaveProperty('post-commit');
      expect(status['pre-commit']).toBe(false);
      expect(status['pre-push']).toBe(false);
      expect(status['commit-msg']).toBe(false);
      expect(status['post-commit']).toBe(false);
    });

    it('should show correct status when some hooks are installed', () => {
      gitHooksService.install('pre-commit');
      gitHooksService.install('commit-msg');

      const status = gitHooksService.list();

      expect(status['pre-commit']).toBe(true);
      expect(status['pre-push']).toBe(false);
      expect(status['commit-msg']).toBe(true);
      expect(status['post-commit']).toBe(false);
    });

    it('should show all installed when all hooks are installed', () => {
      gitHooksService.install('pre-commit');
      gitHooksService.install('pre-push');
      gitHooksService.install('commit-msg');
      gitHooksService.install('post-commit');

      const status = gitHooksService.list();

      expect(status['pre-commit']).toBe(true);
      expect(status['pre-push']).toBe(true);
      expect(status['commit-msg']).toBe(true);
      expect(status['post-commit']).toBe(true);
    });
  });

  describe('getHookPath()', () => {
    it('should return correct path for pre-commit hook', () => {
      const hookPath = gitHooksService.getHookPath('pre-commit');

      expect(hookPath).toBe(path.join(testHooksDir, 'pre-commit'));
    });

    it('should return correct path for pre-push hook', () => {
      const hookPath = gitHooksService.getHookPath('pre-push');

      expect(hookPath).toBe(path.join(testHooksDir, 'pre-push'));
    });

    it('should return correct path for commit-msg hook', () => {
      const hookPath = gitHooksService.getHookPath('commit-msg');

      expect(hookPath).toBe(path.join(testHooksDir, 'commit-msg'));
    });

    it('should return correct path for post-commit hook', () => {
      const hookPath = gitHooksService.getHookPath('post-commit');

      expect(hookPath).toBe(path.join(testHooksDir, 'post-commit'));
    });

    it('should throw error for invalid hook type', () => {
      expect(() => {
        (gitHooksService as any).getHookPath('invalid-hook');
      }).toThrow('Invalid hook type');
    });
  });

  describe('findGitRoot()', () => {
    let testDir: string;
    let testGitRoot: string;

    beforeEach(() => {
      // Create nested directory structure with .git
      testDir = path.join(os.tmpdir(), `git-root-test-${Date.now()}`);
      testGitRoot = path.join(testDir, '.git');
      fs.mkdirSync(path.join(testDir, 'nested', 'deep'), { recursive: true });
      fs.mkdirSync(testGitRoot);
    });

    afterEach(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should find git root from current directory', () => {
      const gitRoot = GitHooksService.findGitRoot(testDir);

      expect(gitRoot).toBe(testGitRoot);
    });

    it('should find git root from nested directory', () => {
      const nestedDir = path.join(testDir, 'nested', 'deep');
      const gitRoot = GitHooksService.findGitRoot(nestedDir);

      expect(gitRoot).toBe(testGitRoot);
    });

    it('should return null when no git directory found', () => {
      const noGitDir = path.join(os.tmpdir(), `no-git-${Date.now()}`);
      fs.mkdirSync(noGitDir, { recursive: true });

      const gitRoot = GitHooksService.findGitRoot(noGitDir);

      expect(gitRoot).toBeNull();

      fs.rmSync(noGitDir, { recursive: true, force: true });
    });

    it('should use process.cwd() when no start path provided', () => {
      // This will return null or a valid path depending on test environment
      const gitRoot = GitHooksService.findGitRoot();

      // Just verify it doesn't throw
      expect(gitRoot === null || typeof gitRoot === 'string').toBe(true);
    });
  });

  describe('hook content generation', () => {
    it('should generate valid pre-commit hook content', () => {
      const content = (gitHooksService as any).generateHookContent('pre-commit');

      expect(content).toContain('#!/bin/sh');
      expect(content).toContain('# DeepL CLI Hook');
      expect(content).toContain('pre-commit');
      expect(content).toContain('deepl hooks uninstall pre-commit');
    });

    it('should generate valid pre-push hook content', () => {
      const content = (gitHooksService as any).generateHookContent('pre-push');

      expect(content).toContain('#!/bin/sh');
      expect(content).toContain('# DeepL CLI Hook');
      expect(content).toContain('pre-push');
      expect(content).toContain('deepl hooks uninstall pre-push');
    });

    it('should generate valid commit-msg hook content', () => {
      const content = (gitHooksService as any).generateHookContent('commit-msg');

      expect(content).toContain('#!/bin/sh');
      expect(content).toContain('# DeepL CLI Hook');
      expect(content).toContain('commit-msg');
      expect(content).toContain('commitlint');
      expect(content).toContain('COMMIT_MSG_FILE=$1');
      expect(content).toContain('deepl hooks uninstall commit-msg');
    });

    it('should generate valid post-commit hook content', () => {
      const content = (gitHooksService as any).generateHookContent('post-commit');

      expect(content).toContain('#!/bin/sh');
      expect(content).toContain('# DeepL CLI Hook');
      expect(content).toContain('post-commit');
      expect(content).toContain('Commit successful');
      expect(content).toContain('CHANGELOG.md');
      expect(content).toContain('deepl hooks uninstall post-commit');
    });

    it('should throw error for invalid hook type', () => {
      expect(() => {
        (gitHooksService as any).generateHookContent('invalid');
      }).toThrow('Invalid hook type');
    });
  });

  describe('isDeepLHook()', () => {
    it('should identify DeepL hook', () => {
      const deeplContent = '#!/bin/sh\n# DeepL CLI Hook\necho "test"';

      expect((gitHooksService as any).isDeepLHook(deeplContent)).toBe(true);
    });

    it('should reject non-DeepL hook', () => {
      const customContent = '#!/bin/sh\necho "custom hook"';

      expect((gitHooksService as any).isDeepLHook(customContent)).toBe(false);
    });
  });
});
