/**
 * Tests for auth and init commands with free key (:fx) endpoint resolution.
 *
 * These tests verify that:
 * 1. auth set-key with a :fx key validates against api-free.deepl.com,
 *    even when the saved config has api.deepl.com as baseUrl.
 * 2. init wizard with a :fx key validates against api-free.deepl.com.
 * 3. Non-:fx keys still validate against api.deepl.com.
 * 4. Custom regional URLs are preserved for validation.
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import nock from 'nock';
import { ConfigService } from '../../src/storage/config';

// Mock @inquirer/prompts for InitCommand tests
const mockInput = jest.fn<Promise<string>, []>();
const mockSelect = jest.fn<Promise<string>, []>();
jest.mock('@inquirer/prompts', () => ({
  input: (...args: unknown[]) => mockInput(...(args as [])),
  select: (...args: unknown[]) => mockSelect(...(args as [])),
}));

describe('AuthCommand free key endpoint resolution', () => {
  let testConfigDir: string;
  let configService: ConfigService;

  beforeEach(() => {
    testConfigDir = path.join(
      os.tmpdir(),
      `.deepl-cli-test-auth-free-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    fs.mkdirSync(testConfigDir, { recursive: true });
    const configPath = path.join(testConfigDir, 'config.json');
    configService = new ConfigService(configPath);
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  it('should validate :fx key against api-free.deepl.com even when config has pro URL', async () => {
    // Config defaults to pro URL (api.deepl.com, usePro: true)
    // But the key is :fx, so validation should hit api-free.deepl.com
    const freeScope = nock('https://api-free.deepl.com')
      .get('/v2/usage')
      .reply(200, { character_count: 0, character_limit: 500000 });

    const { AuthCommand } = await import('../../src/cli/commands/auth');
    const authCommand = new AuthCommand(configService);
    await authCommand.setKey('test-api-key-free:fx');

    expect(freeScope.isDone()).toBe(true);
    expect(configService.getValue('auth.apiKey')).toBe('test-api-key-free:fx');
  });

  it('should validate non-:fx key against api.deepl.com', async () => {
    const proScope = nock('https://api.deepl.com')
      .get('/v2/usage')
      .reply(200, { character_count: 0, character_limit: 500000 });

    const { AuthCommand } = await import('../../src/cli/commands/auth');
    const authCommand = new AuthCommand(configService);
    await authCommand.setKey('test-api-key-pro');

    expect(proScope.isDone()).toBe(true);
    expect(configService.getValue('auth.apiKey')).toBe('test-api-key-pro');
  });

  it('should validate :fx key against custom regional URL when configured', async () => {
    // Set a custom regional URL in config
    configService.set('api.baseUrl', 'https://api-jp.deepl.com');

    const customScope = nock('https://api-jp.deepl.com')
      .get('/v2/usage')
      .reply(200, { character_count: 0, character_limit: 500000 });

    const { AuthCommand } = await import('../../src/cli/commands/auth');
    const authCommand = new AuthCommand(configService);
    await authCommand.setKey('test-api-key-free:fx');

    expect(customScope.isDone()).toBe(true);
    expect(configService.getValue('auth.apiKey')).toBe('test-api-key-free:fx');
  });
});

describe('InitCommand free key endpoint resolution', () => {
  let testConfigDir: string;
  let configService: ConfigService;

  beforeEach(() => {
    testConfigDir = path.join(
      os.tmpdir(),
      `.deepl-cli-test-init-free-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    fs.mkdirSync(testConfigDir, { recursive: true });
    const configPath = path.join(testConfigDir, 'config.json');
    configService = new ConfigService(configPath);
    nock.cleanAll();
    mockInput.mockReset();
    mockSelect.mockReset();
  });

  afterEach(() => {
    nock.cleanAll();
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  it('should validate :fx key against api-free.deepl.com during init', async () => {
    mockInput.mockResolvedValueOnce('test-init-key:fx');
    mockSelect.mockResolvedValueOnce('');

    const freeScope = nock('https://api-free.deepl.com')
      .get('/v2/usage')
      .reply(200, { character_count: 0, character_limit: 500000 });

    const { InitCommand } = await import('../../src/cli/commands/init');
    const cmd = new InitCommand(configService);
    await cmd.run();

    expect(freeScope.isDone()).toBe(true);
    expect(configService.getValue('auth.apiKey')).toBe('test-init-key:fx');
  });

  it('should validate non-:fx key against api.deepl.com during init', async () => {
    mockInput.mockResolvedValueOnce('test-init-key-pro');
    mockSelect.mockResolvedValueOnce('');

    const proScope = nock('https://api.deepl.com')
      .get('/v2/usage')
      .reply(200, { character_count: 0, character_limit: 500000 });

    const { InitCommand } = await import('../../src/cli/commands/init');
    const cmd = new InitCommand(configService);
    await cmd.run();

    expect(proScope.isDone()).toBe(true);
    expect(configService.getValue('auth.apiKey')).toBe('test-init-key-pro');
  });
});
