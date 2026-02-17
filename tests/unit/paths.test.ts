import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolvePaths } from '../../src/utils/paths';

jest.mock('fs');
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

const HOME = os.homedir();

describe('resolvePaths', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env['DEEPL_CONFIG_DIR'];
    delete process.env['XDG_CONFIG_HOME'];
    delete process.env['XDG_CACHE_HOME'];
    mockExistsSync.mockReturnValue(false);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses DEEPL_CONFIG_DIR when set', () => {
    process.env['DEEPL_CONFIG_DIR'] = '/custom/dir';

    const paths = resolvePaths();

    expect(paths.configDir).toBe('/custom/dir');
    expect(paths.configFile).toBe('/custom/dir/config.json');
    expect(paths.cacheDir).toBe('/custom/dir');
    expect(paths.cacheFile).toBe('/custom/dir/cache.db');
  });

  it('treats empty DEEPL_CONFIG_DIR as unset', () => {
    process.env['DEEPL_CONFIG_DIR'] = '';

    const paths = resolvePaths();

    expect(paths.configDir).toBe(path.join(HOME, '.config', 'deepl-cli'));
  });

  it('uses legacy ~/.deepl-cli/ when it exists', () => {
    const legacyDir = path.join(HOME, '.deepl-cli');
    mockExistsSync.mockImplementation((p) => p === legacyDir);

    const paths = resolvePaths();

    expect(paths.configDir).toBe(legacyDir);
    expect(paths.configFile).toBe(path.join(legacyDir, 'config.json'));
    expect(paths.cacheDir).toBe(legacyDir);
    expect(paths.cacheFile).toBe(path.join(legacyDir, 'cache.db'));
  });

  it('uses XDG vars when set and no legacy dir exists', () => {
    process.env['XDG_CONFIG_HOME'] = '/xdg/config';
    process.env['XDG_CACHE_HOME'] = '/xdg/cache';

    const paths = resolvePaths();

    expect(paths.configDir).toBe('/xdg/config/deepl-cli');
    expect(paths.configFile).toBe('/xdg/config/deepl-cli/config.json');
    expect(paths.cacheDir).toBe('/xdg/cache/deepl-cli');
    expect(paths.cacheFile).toBe('/xdg/cache/deepl-cli/cache.db');
  });

  it('uses XDG_CONFIG_HOME for config and default for cache when only config var set', () => {
    process.env['XDG_CONFIG_HOME'] = '/xdg/config';

    const paths = resolvePaths();

    expect(paths.configDir).toBe('/xdg/config/deepl-cli');
    expect(paths.cacheDir).toBe(path.join(HOME, '.cache', 'deepl-cli'));
  });

  it('uses XDG_CACHE_HOME for cache and default for config when only cache var set', () => {
    process.env['XDG_CACHE_HOME'] = '/xdg/cache';

    const paths = resolvePaths();

    expect(paths.configDir).toBe(path.join(HOME, '.config', 'deepl-cli'));
    expect(paths.cacheDir).toBe('/xdg/cache/deepl-cli');
  });

  it('treats empty XDG vars as unset', () => {
    process.env['XDG_CONFIG_HOME'] = '';
    process.env['XDG_CACHE_HOME'] = '';

    const paths = resolvePaths();

    expect(paths.configDir).toBe(path.join(HOME, '.config', 'deepl-cli'));
    expect(paths.cacheDir).toBe(path.join(HOME, '.cache', 'deepl-cli'));
  });

  it('falls back to XDG defaults when no env vars and no legacy dir', () => {
    const paths = resolvePaths();

    expect(paths.configDir).toBe(path.join(HOME, '.config', 'deepl-cli'));
    expect(paths.configFile).toBe(path.join(HOME, '.config', 'deepl-cli', 'config.json'));
    expect(paths.cacheDir).toBe(path.join(HOME, '.cache', 'deepl-cli'));
    expect(paths.cacheFile).toBe(path.join(HOME, '.cache', 'deepl-cli', 'cache.db'));
  });

  it('prefers legacy dir over XDG vars', () => {
    const legacyDir = path.join(HOME, '.deepl-cli');
    mockExistsSync.mockImplementation((p) => p === legacyDir);
    process.env['XDG_CONFIG_HOME'] = '/xdg/config';
    process.env['XDG_CACHE_HOME'] = '/xdg/cache';

    const paths = resolvePaths();

    expect(paths.configDir).toBe(legacyDir);
    expect(paths.cacheDir).toBe(legacyDir);
  });

  it('prefers DEEPL_CONFIG_DIR over legacy dir', () => {
    const legacyDir = path.join(HOME, '.deepl-cli');
    mockExistsSync.mockImplementation((p) => p === legacyDir);
    process.env['DEEPL_CONFIG_DIR'] = '/override';

    const paths = resolvePaths();

    expect(paths.configDir).toBe('/override');
    expect(paths.cacheDir).toBe('/override');
  });
});
