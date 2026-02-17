/**
 * Integration Tests for Style Rules CLI Command
 * Tests CLI argument parsing, HTTP request structure with nock, and error handling
 */

import nock from 'nock';
import { DeepLClient } from '../../src/api/deepl-client.js';
import { StyleRulesService } from '../../src/services/style-rules.js';
import { StyleRulesCommand } from '../../src/cli/commands/style-rules.js';
import { createTestConfigDir, makeRunCLI, DEEPL_FREE_API_URL } from '../helpers';

describe('Style Rules CLI Integration', () => {
  const testConfig = createTestConfigDir('style-rules');
  const { runCLI } = makeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('deepl style-rules --help', () => {
    it('should display help for style-rules command', () => {
      const output = runCLI('deepl style-rules --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('style-rules');
      expect(output).toContain('Manage DeepL style rules');
      expect(output).toContain('list');
    });

    it('should display help for style-rules list subcommand', () => {
      const output = runCLI('deepl style-rules list --help');

      expect(output).toContain('List all style rules');
      expect(output).toContain('--detailed');
      expect(output).toContain('--page');
      expect(output).toContain('--page-size');
      expect(output).toContain('--format');
    });
  });

  describe('deepl style-rules without API key', () => {
    beforeEach(() => {
      try {
        runCLI('deepl auth clear', { stdio: 'pipe' });
      } catch {
        // Ignore if already cleared
      }
    });

    it('should require API key for style-rules list', () => {
      expect.assertions(1);
      try {
        runCLI('deepl style-rules list', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/API key|auth|not set/i);
      }
    });

    it('should require API key for style-rules list --detailed', () => {
      expect.assertions(1);
      try {
        runCLI('deepl style-rules list --detailed', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/API key|auth|not set/i);
      }
    });

    it('should require API key for style-rules list with pagination', () => {
      expect.assertions(1);
      try {
        runCLI('deepl style-rules list --page 1 --page-size 10', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/API key|auth|not set/i);
      }
    });
  });

  describe('option flags validation', () => {
    it('should accept --detailed flag without error', () => {
      try {
        runCLI('deepl style-rules list --detailed', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/unknown.*option.*detailed/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept --page flag without error', () => {
      try {
        runCLI('deepl style-rules list --page 2', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/unknown.*option.*page/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept --page-size flag without error', () => {
      try {
        runCLI('deepl style-rules list --page-size 10', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/unknown.*option.*page-size/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept --format json flag without error', () => {
      try {
        runCLI('deepl style-rules list --format json', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/unknown.*option.*format/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept all flags combined', () => {
      try {
        runCLI('deepl style-rules list --detailed --page 1 --page-size 5 --format json', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });
  });

  describe('command structure', () => {
    it('should be listed in main help', () => {
      const output = runCLI('deepl --help');
      expect(output).toContain('style-rules');
    });

    it('should describe as Pro API only', () => {
      const output = runCLI('deepl style-rules --help');
      expect(output).toContain('Pro API only');
    });

    it('should have list as a subcommand', () => {
      const output = runCLI('deepl style-rules --help');
      expect(output).toContain('list');
      expect(output).toContain('List all style rules');
    });
  });
});

describe('Style Rules API Integration', () => {
  const API_KEY = 'test-api-key-123:fx';
  const FREE_API_URL = DEEPL_FREE_API_URL;
  let client: DeepLClient;
  let styleRulesCommand: StyleRulesCommand;

  beforeEach(() => {
    client = new DeepLClient(API_KEY);
    styleRulesCommand = new StyleRulesCommand(new StyleRulesService(client));
  });

  afterEach(() => {
    client.destroy();
    nock.cleanAll();
  });

  describe('list - happy path', () => {
    it('should make GET request to /v3/style_rules', async () => {
      const scope = nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(200, {
          style_rules: [
            {
              style_id: 'abc-123',
              name: 'Business Writing',
              language: 'en',
              version: 1,
              creation_time: '2024-01-01T00:00:00Z',
              updated_time: '2024-01-02T00:00:00Z',
            },
          ],
        });

      const rules = await styleRulesCommand.list();

      expect(rules).toHaveLength(1);
      expect(rules[0]?.styleId).toBe('abc-123');
      expect(rules[0]?.name).toBe('Business Writing');
      expect(rules[0]?.language).toBe('en');
      expect(rules[0]?.version).toBe(1);
      expect(rules[0]?.creationTime).toBe('2024-01-01T00:00:00Z');
      expect(rules[0]?.updatedTime).toBe('2024-01-02T00:00:00Z');
      expect(scope.isDone()).toBe(true);
    });

    it('should return multiple style rules', async () => {
      const scope = nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(200, {
          style_rules: [
            {
              style_id: 'abc-123',
              name: 'Business Writing',
              language: 'en',
              version: 1,
              creation_time: '2024-01-01T00:00:00Z',
              updated_time: '2024-01-02T00:00:00Z',
            },
            {
              style_id: 'def-456',
              name: 'Academic Style',
              language: 'de',
              version: 2,
              creation_time: '2024-02-01T00:00:00Z',
              updated_time: '2024-02-15T00:00:00Z',
            },
          ],
        });

      const rules = await styleRulesCommand.list();

      expect(rules).toHaveLength(2);
      expect(rules[0]?.name).toBe('Business Writing');
      expect(rules[1]?.name).toBe('Academic Style');
      expect(rules[1]?.language).toBe('de');
      expect(scope.isDone()).toBe(true);
    });

    it('should handle empty style rules list', async () => {
      const scope = nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(200, {
          style_rules: [],
        });

      const rules = await styleRulesCommand.list();

      expect(rules).toHaveLength(0);
      expect(scope.isDone()).toBe(true);
    });

    it('should format empty results correctly', async () => {
      nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(200, { style_rules: [] });

      const rules = await styleRulesCommand.list();
      const output = styleRulesCommand.formatStyleRulesList(rules);

      expect(output).toBe('No style rules found.');
    });

    it('should format style rules list output correctly', async () => {
      nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(200, {
          style_rules: [
            {
              style_id: 'abc-123',
              name: 'Business Writing',
              language: 'en',
              version: 1,
              creation_time: '2024-01-01T00:00:00Z',
              updated_time: '2024-01-02T00:00:00Z',
            },
          ],
        });

      const rules = await styleRulesCommand.list();
      const output = styleRulesCommand.formatStyleRulesList(rules);

      expect(output).toContain('Found 1 style rule(s)');
      expect(output).toContain('Business Writing');
      expect(output).toContain('abc-123');
      expect(output).toContain('en');
    });
  });

  describe('list --detailed', () => {
    it('should pass detailed=true query parameter', async () => {
      const scope = nock(FREE_API_URL)
        .get('/v3/style_rules')
        .query({ detailed: true })
        .reply(200, {
          style_rules: [
            {
              style_id: 'abc-123',
              name: 'Business Writing',
              language: 'en',
              version: 1,
              creation_time: '2024-01-01T00:00:00Z',
              updated_time: '2024-01-02T00:00:00Z',
              configured_rules: ['no_passive_voice', 'short_sentences'],
              custom_instructions: [
                { label: 'Voice', prompt: 'Use active voice' },
                { label: 'Length', prompt: 'Keep sentences under 20 words' },
              ],
            },
          ],
        });

      const rules = await styleRulesCommand.list({ detailed: true });

      expect(rules).toHaveLength(1);
      const rule = rules[0] as any;
      expect(rule.configuredRules).toEqual(['no_passive_voice', 'short_sentences']);
      expect(rule.customInstructions).toEqual([
        { label: 'Voice', prompt: 'Use active voice' },
        { label: 'Length', prompt: 'Keep sentences under 20 words' },
      ]);
      expect(scope.isDone()).toBe(true);
    });

    it('should format detailed style rules with configured rules and instructions', async () => {
      nock(FREE_API_URL)
        .get('/v3/style_rules')
        .query({ detailed: true })
        .reply(200, {
          style_rules: [
            {
              style_id: 'abc-123',
              name: 'Business Writing',
              language: 'en',
              version: 1,
              creation_time: '2024-01-01T00:00:00Z',
              updated_time: '2024-01-02T00:00:00Z',
              configured_rules: ['rule_a', 'rule_b'],
              custom_instructions: [
                { label: 'Instruction one', prompt: 'Do this' },
                { label: 'Instruction two', prompt: 'Do that' },
              ],
            },
          ],
        });

      const rules = await styleRulesCommand.list({ detailed: true });
      const output = styleRulesCommand.formatStyleRulesList(rules);

      expect(output).toContain('rule_a, rule_b');
      expect(output).toContain('Instruction one');
      expect(output).toContain('Instruction two');
    });
  });

  describe('list with pagination', () => {
    it('should pass page query parameter', async () => {
      const scope = nock(FREE_API_URL)
        .get('/v3/style_rules')
        .query({ page: 2 })
        .reply(200, { style_rules: [] });

      await styleRulesCommand.list({ page: 2 });

      expect(scope.isDone()).toBe(true);
    });

    it('should pass page_size query parameter', async () => {
      const scope = nock(FREE_API_URL)
        .get('/v3/style_rules')
        .query({ page_size: 10 })
        .reply(200, { style_rules: [] });

      await styleRulesCommand.list({ pageSize: 10 });

      expect(scope.isDone()).toBe(true);
    });

    it('should pass both page and page_size query parameters', async () => {
      const scope = nock(FREE_API_URL)
        .get('/v3/style_rules')
        .query({ page: 1, page_size: 5 })
        .reply(200, {
          style_rules: [
            {
              style_id: 'abc-123',
              name: 'Paginated Rule',
              language: 'en',
              version: 1,
              creation_time: '2024-01-01T00:00:00Z',
              updated_time: '2024-01-02T00:00:00Z',
            },
          ],
        });

      const rules = await styleRulesCommand.list({ page: 1, pageSize: 5 });

      expect(rules).toHaveLength(1);
      expect(rules[0]?.name).toBe('Paginated Rule');
      expect(scope.isDone()).toBe(true);
    });

    it('should combine pagination with detailed option', async () => {
      const scope = nock(FREE_API_URL)
        .get('/v3/style_rules')
        .query({ detailed: true, page: 1, page_size: 10 })
        .reply(200, {
          style_rules: [
            {
              style_id: 'abc-123',
              name: 'Full Options Rule',
              language: 'fr',
              version: 3,
              creation_time: '2024-01-01T00:00:00Z',
              updated_time: '2024-01-02T00:00:00Z',
              configured_rules: ['concise'],
              custom_instructions: [{ label: 'Brevity', prompt: 'Be brief' }],
            },
          ],
        });

      const rules = await styleRulesCommand.list({ detailed: true, page: 1, pageSize: 10 });

      expect(rules).toHaveLength(1);
      const rule = rules[0] as any;
      expect(rule.language).toBe('fr');
      expect(rule.configuredRules).toEqual(['concise']);
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('JSON format output', () => {
    it('should format rules as valid JSON', async () => {
      nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(200, {
          style_rules: [
            {
              style_id: 'abc-123',
              name: 'JSON Rule',
              language: 'en',
              version: 1,
              creation_time: '2024-01-01T00:00:00Z',
              updated_time: '2024-01-02T00:00:00Z',
            },
          ],
        });

      const rules = await styleRulesCommand.list();
      const jsonOutput = styleRulesCommand.formatStyleRulesJson(rules);
      const parsed = JSON.parse(jsonOutput);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].styleId).toBe('abc-123');
      expect(parsed[0].name).toBe('JSON Rule');
      expect(parsed[0].language).toBe('en');
      expect(parsed[0].version).toBe(1);
    });

    it('should format empty rules as empty JSON array', async () => {
      nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(200, { style_rules: [] });

      const rules = await styleRulesCommand.list();
      const jsonOutput = styleRulesCommand.formatStyleRulesJson(rules);

      expect(JSON.parse(jsonOutput)).toEqual([]);
    });
  });

  describe('HTTP request structure', () => {
    it('should include Authorization header', async () => {
      const scope = nock(FREE_API_URL, {
        reqheaders: {
          authorization: `DeepL-Auth-Key ${API_KEY}`,
        },
      })
        .get('/v3/style_rules')
        .reply(200, { style_rules: [] });

      await styleRulesCommand.list();

      expect(scope.isDone()).toBe(true);
    });

    it('should use GET method for listing style rules', async () => {
      const scope = nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(200, { style_rules: [] });

      await styleRulesCommand.list();

      expect(scope.isDone()).toBe(true);
    });

    it('should not send request body for GET request', async () => {
      let receivedBody: any = undefined;
      const scope = nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(function (_uri: string, body: any) {
          receivedBody = body;
          return [200, { style_rules: [] }];
        });

      await styleRulesCommand.list();

      expect(scope.isDone()).toBe(true);
      expect(receivedBody).toBe('');
    });

    it('should use Pro API URL when configured', async () => {
      const proClient = new DeepLClient(API_KEY, { usePro: true });
      const proCommand = new StyleRulesCommand(new StyleRulesService(proClient));

      const scope = nock('https://api.deepl.com')
        .get('/v3/style_rules')
        .reply(200, { style_rules: [] });

      await proCommand.list();
      proClient.destroy();

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('response field mapping', () => {
    it('should map snake_case API fields to camelCase', async () => {
      nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(200, {
          style_rules: [
            {
              style_id: 'test-id-001',
              name: 'Mapped Rule',
              language: 'en',
              version: 5,
              creation_time: '2024-06-01T10:00:00Z',
              updated_time: '2024-06-15T14:30:00Z',
            },
          ],
        });

      const rules = await styleRulesCommand.list();

      expect(rules[0]).toEqual({
        styleId: 'test-id-001',
        name: 'Mapped Rule',
        language: 'en',
        version: 5,
        creationTime: '2024-06-01T10:00:00Z',
        updatedTime: '2024-06-15T14:30:00Z',
      });
    });

    it('should map detailed fields correctly', async () => {
      nock(FREE_API_URL)
        .get('/v3/style_rules')
        .query({ detailed: true })
        .reply(200, {
          style_rules: [
            {
              style_id: 'test-id-002',
              name: 'Detailed Mapped Rule',
              language: 'de',
              version: 2,
              creation_time: '2024-03-01T00:00:00Z',
              updated_time: '2024-03-10T00:00:00Z',
              configured_rules: ['formal_tone', 'no_contractions'],
              custom_instructions: [{ label: 'Formality', prompt: 'Always use formal language' }],
            },
          ],
        });

      const rules = await styleRulesCommand.list({ detailed: true });
      const rule = rules[0] as any;

      expect(rule.styleId).toBe('test-id-002');
      expect(rule.configuredRules).toEqual(['formal_tone', 'no_contractions']);
      expect(rule.customInstructions).toEqual([{ label: 'Formality', prompt: 'Always use formal language' }]);
    });
  });

  // error handling must be the last describe block — replyWithError in nock v14
  // emits async socket errors that leak into subsequent tests
  describe('error handling', () => {
    let noRetryClient: DeepLClient;
    let noRetryCommand: StyleRulesCommand;

    beforeEach(() => {
      noRetryClient = new DeepLClient(API_KEY, { maxRetries: 0 });
      noRetryCommand = new StyleRulesCommand(new StyleRulesService(noRetryClient));
    });

    afterEach(() => {
      noRetryClient.destroy();
    });

    it('should handle 403 authentication error', async () => {
      nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(403, { message: 'Invalid API key' });

      await expect(noRetryCommand.list()).rejects.toThrow('Authentication failed');
    });

    it('should handle 429 rate limit error', async () => {
      nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(429, { message: 'Too many requests' });

      await expect(noRetryCommand.list()).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle 503 service unavailable error', async () => {
      nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(503, { message: 'Service unavailable' });

      await expect(noRetryCommand.list()).rejects.toThrow('Service temporarily unavailable');
    });

    it('should handle 456 quota exceeded error', async () => {
      nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(456, { message: 'Quota exceeded' });

      await expect(noRetryCommand.list()).rejects.toThrow('Quota exceeded');
    });

    it('should handle unexpected API response format', async () => {
      nock(FREE_API_URL)
        .get('/v3/style_rules')
        .reply(500, { error: 'Internal server error' });

      await expect(noRetryCommand.list()).rejects.toThrow();
    });

    // replyWithError must be last — nock v14 emits async socket errors that
    // leak into subsequent tests despite abortPendingRequests()
    it('should handle network errors', async () => {
      nock(FREE_API_URL)
        .get('/v3/style_rules')
        .replyWithError('Connection refused');

      await expect(noRetryCommand.list()).rejects.toThrow();
    });
  });
});
