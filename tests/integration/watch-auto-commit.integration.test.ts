/**
 * Integration Tests for Watch auto-commit
 * Tests that autoCommit() runs the correct git commands in a real temp repo
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { WatchCommand } from '../../src/cli/commands/watch';
import {
  createMockTranslationService,
  createMockGlossaryService,
} from '../helpers/mock-factories';

// Suppress chalk and logger noise
jest.mock('chalk', () => ({
  default: {
    green: (t: string) => t,
    yellow: (t: string) => t,
    red: (t: string) => t,
    blue: (t: string) => t,
    gray: (t: string) => t,
  },
  green: (t: string) => t,
  yellow: (t: string) => t,
  red: (t: string) => t,
  blue: (t: string) => t,
  gray: (t: string) => t,
}));

jest.mock('../../src/utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    output: jest.fn(),
    shouldShowSpinner: jest.fn(() => true),
    setQuiet: jest.fn(),
    isQuiet: jest.fn(() => false),
  },
}));

import { Logger } from '../../src/utils/logger';

describe('Watch auto-commit integration', () => {
  let tmpDir: string;
  let watchCommand: WatchCommand;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-autocommit-'))
    );

    // Init a real git repo
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', {
      cwd: tmpDir,
      stdio: 'ignore',
    });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });

    // Create an initial commit so HEAD exists
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'init');
    execSync('git add . && git commit -m "init"', {
      cwd: tmpDir,
      stdio: 'ignore',
    });

    watchCommand = new WatchCommand(
      createMockTranslationService(),
      createMockGlossaryService()
    );
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // Access private autoCommit via bracket notation
  function callAutoCommit(sourceFile: string, result: any): Promise<void> {
    return (watchCommand as any).autoCommit(sourceFile, result);
  }

  it('should git add and commit a single translated file', async () => {
    const outFile = path.join(tmpDir, 'file.es.md');
    fs.writeFileSync(outFile, 'Hola mundo');

    await callAutoCommit('file.md', {
      targetLang: 'es',
      text: 'Hola mundo',
      outputPath: outFile,
    });

    // Verify git log shows the commit
    const log = execSync('git log --oneline -1', {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    expect(log).toContain('chore(i18n): auto-translate file.md to es');
    expect(Logger.success as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining('Auto-committed')
    );
  });

  it('should git add and commit multiple translated files', async () => {
    const esFile = path.join(tmpDir, 'file.es.md');
    const frFile = path.join(tmpDir, 'file.fr.md');
    fs.writeFileSync(esFile, 'Hola');
    fs.writeFileSync(frFile, 'Bonjour');

    await callAutoCommit('file.md', [
      { targetLang: 'es', text: 'Hola', outputPath: esFile },
      { targetLang: 'fr', text: 'Bonjour', outputPath: frFile },
    ]);

    const log = execSync('git log --oneline -1', {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    expect(log).toContain('chore(i18n): auto-translate file.md to es, fr');

    // Both files should be in the commit
    const files = execSync('git diff-tree --no-commit-id --name-only -r HEAD', {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    expect(files).toContain('file.es.md');
    expect(files).toContain('file.fr.md');
  });

  it('should skip commit when not in a git repository', async () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-no-git-'));
    const outFile = path.join(nonGitDir, 'file.es.md');
    fs.writeFileSync(outFile, 'Hola');

    await callAutoCommit('file.md', {
      targetLang: 'es',
      text: 'Hola',
      outputPath: outFile,
    });

    expect(Logger.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining('Not a git repository')
    );

    fs.rmSync(nonGitDir, { recursive: true, force: true });
  });

  it('should return early when result has no output files', async () => {
    await callAutoCommit('file.md', {
      targetLang: 'es',
      text: 'Hola',
      // no outputPath
    });

    // Should only have the initial commit
    const count = execSync('git rev-list --count HEAD', {
      cwd: tmpDir,
      encoding: 'utf-8',
    }).trim();
    expect(count).toBe('1');
  });

  it('should handle commit failure gracefully', async () => {
    // git refuses to add an ignored path, so the add fails inside a real repo.
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'file.es.md\n');
    execSync('git add .gitignore && git commit -m "ignore"', {
      cwd: tmpDir,
      stdio: 'ignore',
    });
    fs.writeFileSync(path.join(tmpDir, 'file.es.md'), 'Hola');

    await callAutoCommit('file.md', {
      targetLang: 'es',
      text: 'Hola',
      outputPath: path.join(tmpDir, 'file.es.md'),
    });

    expect(Logger.error as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining('Auto-commit failed'),
      expect.any(String)
    );
  });

  it('commits into the repository holding the output file, not the process cwd', async () => {
    // A second repository stands in for the directory the CLI was started in.
    const otherRepo = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-other-repo-'))
    );
    execSync('git init', { cwd: otherRepo, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', {
      cwd: otherRepo,
      stdio: 'ignore',
    });
    execSync('git config user.name "Test"', {
      cwd: otherRepo,
      stdio: 'ignore',
    });
    fs.writeFileSync(path.join(otherRepo, 'README.md'), 'init');
    execSync('git add . && git commit -m "init"', {
      cwd: otherRepo,
      stdio: 'ignore',
    });

    const outFile = path.join(tmpDir, 'file.es.md');
    fs.writeFileSync(outFile, 'Hola mundo');

    const origCwd = process.cwd();
    process.chdir(otherRepo);
    try {
      await callAutoCommit('file.md', {
        targetLang: 'es',
        text: 'Hola mundo',
        outputPath: outFile,
      });
    } finally {
      process.chdir(origCwd);
    }

    const failures = (Logger.error as jest.Mock).mock.calls.filter((call) =>
      String(call[0]).includes('Auto-commit failed')
    );
    expect(failures).toEqual([]);

    const committed = execSync(
      'git diff-tree --no-commit-id --name-only -r HEAD',
      { cwd: tmpDir, encoding: 'utf-8' }
    );
    expect(committed).toContain('file.es.md');

    const otherLog = execSync('git log --oneline', {
      cwd: otherRepo,
      encoding: 'utf-8',
    });
    expect(otherLog).not.toContain('auto-translate');

    fs.rmSync(otherRepo, { recursive: true, force: true });
  });

  it('serializes concurrent auto-commits so every translation lands', async () => {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    for (const name of files) {
      fs.writeFileSync(path.join(tmpDir, `${name}.es.md`), `Hola ${name}`);
    }

    await Promise.all(
      files.map((name) =>
        callAutoCommit(`${name}.md`, {
          targetLang: 'es',
          text: `Hola ${name}`,
          outputPath: path.join(tmpDir, `${name}.es.md`),
        })
      )
    );

    const failures = (Logger.error as jest.Mock).mock.calls.filter((call) =>
      String(call[0]).includes('Auto-commit failed')
    );
    expect(failures).toEqual([]);

    const log = execSync('git log --oneline', {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    for (const name of files) {
      expect(log).toContain(`auto-translate ${name}.md to es`);
    }
    const status = execSync('git status --porcelain', {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    expect(status.trim()).toBe('');
  }, 60000);
});
