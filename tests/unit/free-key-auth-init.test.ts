import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import nock from 'nock';
import { ConfigService } from '../../src/storage/config';

describe('AuthCommand endpoint resolution', () => {
  let testConfigDir: string;
  let configService: ConfigService;

  beforeEach(() => {
    testConfigDir = path.join(
      os.tmpdir(),
      `.deepl-cli-test-auth-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    fs.mkdirSync(testConfigDir, { recursive: true });
    configService = new ConfigService(path.join(testConfigDir, 'config.json'));
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  it('validates :fx key against api-free.deepl.com', async () => {
    const scope = nock('https://api-free.deepl.com')
      .get('/v2/usage')
      .reply(200, { character_count: 0, character_limit: 500000 });

    const { AuthCommand } = await import('../../src/cli/commands/auth');
    await new AuthCommand(configService).setKey('test-key:fx');

    expect(scope.isDone()).toBe(true);
    expect(configService.getValue('auth.apiKey')).toBe('test-key:fx');
  });

  it('validates non-:fx key against api.deepl.com', async () => {
    const scope = nock('https://api.deepl.com')
      .get('/v2/usage')
      .reply(200, { character_count: 0, character_limit: 500000 });

    const { AuthCommand } = await import('../../src/cli/commands/auth');
    await new AuthCommand(configService).setKey('test-key-pro');

    expect(scope.isDone()).toBe(true);
    expect(configService.getValue('auth.apiKey')).toBe('test-key-pro');
  });

  it('preserves custom regional URL for :fx key', async () => {
    configService.set('api.baseUrl', 'https://api-jp.deepl.com');

    const scope = nock('https://api-jp.deepl.com')
      .get('/v2/usage')
      .reply(200, { character_count: 0, character_limit: 500000 });

    const { AuthCommand } = await import('../../src/cli/commands/auth');
    await new AuthCommand(configService).setKey('test-key:fx');

    expect(scope.isDone()).toBe(true);
    expect(configService.getValue('auth.apiKey')).toBe('test-key:fx');
  });
});
