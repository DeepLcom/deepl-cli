/**
 * A repo-supplied `.deepl-sync.yaml` must not be able to hand fast-glob a
 * pattern whose brace expansion exhausts the heap. `braces` bounds only its
 * input length, so a 107-byte pattern of 20 `{a,b}` groups allocates ~600MB
 * and 22 groups aborts the process with a V8 OOM — an abort, not an exception,
 * so no per-bucket try/catch can contain it.
 *
 * Every config field whose strings reach fast-glob is covered here: bucket
 * `include` and `exclude`, top-level `ignore`, and `context.scan_paths`.
 */

import { validateSyncConfig } from '../../../src/sync/sync-config';
import { ConfigError } from '../../../src/utils/errors';

const BOMB = `${'{a,b}'.repeat(200)}/*.json`;
const SMALL_BOMB = `${'{a,b}'.repeat(20)}/*.json`;

function baseConfig(): Record<string, unknown> {
  return {
    version: 1,
    source_locale: 'en',
    target_locales: ['de'],
    buckets: {
      json: {
        include: ['locales/*.json'],
        target_path_pattern: 'locales/{locale}.json',
      },
    },
  };
}

describe('sync config glob expansion bounds', () => {
  it('should reject a brace bomb in bucket include', () => {
    const config = baseConfig();
    (config['buckets'] as Record<string, Record<string, unknown>>)['json']![
      'include'
    ] = [BOMB];
    expect(() => validateSyncConfig(config)).toThrow(ConfigError);
  });

  it('should reject a brace bomb in bucket exclude', () => {
    const config = baseConfig();
    (config['buckets'] as Record<string, Record<string, unknown>>)['json']![
      'exclude'
    ] = [BOMB];
    expect(() => validateSyncConfig(config)).toThrow(ConfigError);
  });

  it('should reject a brace bomb in top-level ignore', () => {
    const config = baseConfig();
    config['ignore'] = [BOMB];
    expect(() => validateSyncConfig(config)).toThrow(ConfigError);
  });

  it('should reject a brace bomb in context.scan_paths', () => {
    const config = baseConfig();
    config['context'] = { enabled: true, scan_paths: [BOMB] };
    expect(() => validateSyncConfig(config)).toThrow(ConfigError);
  });

  it('should reject the sub-1KB variant that already exhausts the heap', () => {
    const config = baseConfig();
    (config['buckets'] as Record<string, Record<string, unknown>>)['json']![
      'include'
    ] = [SMALL_BOMB];
    expect(() => validateSyncConfig(config)).toThrow(ConfigError);
  });

  it('should reject a bomb hidden behind a benign first entry', () => {
    const config = baseConfig();
    (config['buckets'] as Record<string, Record<string, unknown>>)['json']![
      'include'
    ] = ['locales/*.json', BOMB];
    expect(() => validateSyncConfig(config)).toThrow(ConfigError);
  });

  it('should name the offending bucket and field', () => {
    const config = baseConfig();
    (config['buckets'] as Record<string, Record<string, unknown>>)['json']![
      'exclude'
    ] = [BOMB];
    expect(() => validateSyncConfig(config)).toThrow(/buckets\.json\.exclude/);
  });

  it('should still accept realistic brace usage in every field', () => {
    const config = baseConfig();
    (config['buckets'] as Record<string, Record<string, unknown>>)['json']![
      'include'
    ] = ['{en,de,fr}/**/*.{json,yaml,yml}'];
    (config['buckets'] as Record<string, Record<string, unknown>>)['json']![
      'exclude'
    ] = ['**/{node_modules,dist,coverage}/**'];
    config['ignore'] = ['**/*.{min,bundle}.json'];
    config['context'] = {
      enabled: true,
      scan_paths: ['src/**/*.{ts,tsx,js,jsx}'],
    };
    expect(() => validateSyncConfig(config)).not.toThrow();
  });
});
