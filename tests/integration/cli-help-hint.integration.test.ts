import { makeNodeRunCLI, createTestConfigDir, type TestConfigDir } from '../helpers/run-cli';
import * as fs from 'fs';
import * as path from 'path';

describe('Getting Started help hint', () => {
  let testDir: TestConfigDir;

  beforeEach(() => {
    testDir = createTestConfigDir('help-hint');
  });

  afterEach(() => {
    testDir.cleanup();
  });

  it('should show Getting Started hint when no API key is configured', () => {
    const { runCLI } = makeNodeRunCLI(testDir.path, { excludeApiKey: true });
    const output = runCLI('--help');

    expect(output).toContain('Getting Started: Run deepl init to set up your API key.');
  });

  it('should NOT show Getting Started hint when API key is set via env', () => {
    const { runCLI } = makeNodeRunCLI(testDir.path, { apiKey: 'test-api-key-1234' });
    const output = runCLI('--help');

    expect(output).not.toContain('Getting Started');
  });

  it('should NOT show Getting Started hint when API key is in config', () => {
    const configFile = path.join(testDir.path, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify({ auth: { apiKey: 'test-key-5678' } }));

    const { runCLI } = makeNodeRunCLI(testDir.path, { excludeApiKey: true });
    const output = runCLI('--help');

    expect(output).not.toContain('Getting Started');
  });
});
