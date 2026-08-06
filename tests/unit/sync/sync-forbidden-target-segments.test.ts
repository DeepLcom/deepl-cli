/**
 * `FORBIDDEN_TARGET_SEGMENTS` exists so a translated-locale name can never
 * become VCS metadata or CI workflow code. It had exactly one enforcement
 * site — inside the `if (target_path_pattern !== undefined)` branch of config
 * validation — so a bucket that simply omitted `target_path_pattern` reached
 * the default locale-substitution path with no check at all:
 *
 *   buckets.yaml.include: ['.github/workflows/en.yml']
 *   -> sync writes .github/workflows/de.yml from API-returned bytes
 *
 * `assertPathWithinRoot` accepted it, because the path never leaves the
 * project root. The guard now lives on the resolved path at that shared
 * boundary, so every read and write in the sync pipeline inherits it —
 * including the multi-locale branch, which writes back to the source path and
 * never calls `resolveTargetPath` at all.
 */

import * as path from 'path';
import { assertPathWithinRoot } from '../../../src/sync/sync-utils';
import { validateSyncConfig } from '../../../src/sync/sync-config';
import { ValidationError } from '../../../src/utils/errors';

const ROOT = path.resolve('/project');

describe('forbidden target segments on resolved paths', () => {
  it.each([
    ['a CI workflow file', '.github/workflows/de.yml'],
    ['the CI directory itself', '.github'],
    ['a file directly in the CI directory', '.github/de.yml'],
    ['git metadata', '.git/config'],
    ['the git directory itself', '.git'],
    ['a nested CI directory', 'packages/app/.github/workflows/de.yml'],
    ['a nested git directory', 'vendor/dep/.git/hooks/pre-commit'],
  ])('should reject %s', (_label, relPath) => {
    expect(() => assertPathWithinRoot(path.join(ROOT, relPath), ROOT)).toThrow(
      ValidationError
    );
  });

  it('should reject case variants, since the filesystem may not care', () => {
    expect(() =>
      assertPathWithinRoot(path.join(ROOT, '.GitHub/workflows/de.yml'), ROOT)
    ).toThrow(ValidationError);
  });

  it('should name the offending directory rather than claim a root escape', () => {
    expect(() =>
      assertPathWithinRoot(path.join(ROOT, '.github/workflows/de.yml'), ROOT)
    ).toThrow(/\.github/);
    expect(() =>
      assertPathWithinRoot(path.join(ROOT, '.github/workflows/de.yml'), ROOT)
    ).not.toThrow(/escapes project root/);
  });

  it.each([
    ['a normal locale file', 'locales/de.json'],
    ['a dotfile directory that is not VCS metadata', '.config/locales/de.json'],
    ['a path whose segment merely starts with .git', '.gitlab/de.yml'],
    ['a file named .gitignore', '.gitignore'],
    ['a segment containing github as a substring', 'src/github-api/de.json'],
  ])('should still accept %s', (_label, relPath) => {
    expect(() =>
      assertPathWithinRoot(path.join(ROOT, relPath), ROOT)
    ).not.toThrow();
  });

  it('should keep reporting a root escape as a root escape', () => {
    expect(() =>
      assertPathWithinRoot(path.join(ROOT, '..', 'etc', 'passwd'), ROOT)
    ).toThrow(/escapes project root/);
  });

  it('should still reject a forbidden segment in target_path_pattern at config load', () => {
    expect(() =>
      validateSyncConfig({
        version: 1,
        source_locale: 'en',
        target_locales: ['de'],
        buckets: {
          yaml: {
            include: ['locales/en.yml'],
            target_path_pattern: '.github/workflows/{locale}.yml',
          },
        },
      })
    ).toThrow(/\.github/);
  });
});
