 

import { Command } from 'commander';

// ── Mock chalk ──────────────────────────────────────────────────────────────
jest.mock('chalk', () => {
  const passthrough = (s: string) => s;
  const obj: Record<string, unknown> & { level: number } = {
    level: 3,
    red: passthrough,
    green: passthrough,
    blue: passthrough,
    yellow: passthrough,
    gray: passthrough,
    bold: passthrough,
  };
  return { __esModule: true, default: obj };
});

// ── Mock Logger ─────────────────────────────────────────────────────────────
jest.mock('../../src/utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    output: jest.fn(),
    shouldShowSpinner: jest.fn(() => false),
    setQuiet: jest.fn(),
    isQuiet: jest.fn(() => false),
  },
}));

// ── Stable mock fn references ───────────────────────────────────────────────
const mockTranslate = jest.fn();
const mockTranslateFromStdin = jest.fn();

const mockVoiceCmdObj = {
  translate: mockTranslate,
  translateFromStdin: mockTranslateFromStdin,
};

// ── Mock service-factory ────────────────────────────────────────────────────
jest.mock('../../src/cli/commands/service-factory', () => ({
  createVoiceCommand: jest.fn(),
}));

// ── Mock GlossaryService ────────────────────────────────────────────────────
const mockResolveGlossaryId = jest.fn();
jest.mock('../../src/services/glossary', () => ({
  GlossaryService: jest.fn().mockImplementation(() => ({
    resolveGlossaryId: mockResolveGlossaryId,
  })),
}));

import { Logger } from '../../src/utils/logger';
const mockLogger = Logger as jest.Mocked<typeof Logger>;

function resetAllMockImplementations() {
  (Logger.shouldShowSpinner as jest.Mock).mockReturnValue(false);
  (Logger.isQuiet as jest.Mock).mockReturnValue(false);

  mockTranslate.mockResolvedValue('Translated audio text');
  mockTranslateFromStdin.mockResolvedValue('Translated stdin text');

  const { createVoiceCommand } = require('../../src/cli/commands/service-factory');
  createVoiceCommand.mockResolvedValue(mockVoiceCmdObj);
}

describe('registerVoice', () => {
  let program: Command;
  let handleError: jest.Mock;
  let getApiKeyAndOptions: jest.Mock;
  let createDeepLClient: jest.Mock;

  beforeEach(() => {
    resetAllMockImplementations();
    mockResolveGlossaryId.mockReset();
    mockResolveGlossaryId.mockImplementation((id: string) => Promise.resolve(id));

    program = new Command();
    program.exitOverride();
    handleError = jest.fn((err: unknown) => {
      throw err;
    });
    getApiKeyAndOptions = jest.fn().mockReturnValue({
      apiKey: 'test-key',
      options: {},
    });
    createDeepLClient = jest.fn().mockResolvedValue({ destroy: jest.fn() });
  });

  async function loadAndRegister() {
    const { registerVoice } = await import('../../src/cli/commands/register-voice');
    registerVoice(program, { getApiKeyAndOptions, createDeepLClient, handleError } as any);
  }

  it('should throw error when --to is missing', async () => {
    await loadAndRegister();
    await expect(
      program.parseAsync(['node', 'test', 'voice', 'recording.ogg']),
    ).rejects.toThrow(/required option.*--to/i);
  });

  it('should call translate for file argument and Logger.output the result', async () => {
    await loadAndRegister();
    await program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de']);

    const { createVoiceCommand } = require('../../src/cli/commands/service-factory');
    expect(createVoiceCommand).toHaveBeenCalledWith(getApiKeyAndOptions);
    expect(mockTranslate).toHaveBeenCalledWith(
      'recording.ogg',
      expect.objectContaining({ to: 'de' }),
    );
    expect(mockLogger.output).toHaveBeenCalledWith('Translated audio text');
  });

  it('should call translateFromStdin when file is "-"', async () => {
    await loadAndRegister();
    await program.parseAsync(['node', 'test', 'voice', '-', '--to', 'es']);

    expect(mockTranslateFromStdin).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'es' }),
    );
    expect(mockLogger.output).toHaveBeenCalledWith('Translated stdin text');
  });

  it('should call handleError on failure', async () => {
    const translateError = new Error('Voice API unavailable');
    mockTranslate.mockRejectedValue(translateError);

    await loadAndRegister();
    await expect(
      program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de']),
    ).rejects.toThrow('Voice API unavailable');

    expect(handleError).toHaveBeenCalledWith(translateError);
  });

  it('should pass format and other options through correctly', async () => {
    await loadAndRegister();
    await program.parseAsync([
      'node', 'test', 'voice', 'recording.ogg',
      '--to', 'de',
      '--from', 'en',
      '--formality', 'more',
      '--glossary', 'gloss-123',
      '--content-type', 'audio/ogg',
      '--chunk-size', '8000',
      '--chunk-interval', '300',
      '--no-stream',
      '--format', 'json',
    ]);

    expect(mockTranslate).toHaveBeenCalledWith(
      'recording.ogg',
      expect.objectContaining({
        to: 'de',
        from: 'en',
        formality: 'more',
        glossary: 'gloss-123',
        contentType: 'audio/ogg',
        chunkSize: 8000,
        chunkInterval: 300,
        stream: false,
        format: 'json',
      }),
    );
  });

  describe('bounds validation for numeric options', () => {
    it.each([
      ['non-numeric', 'abc'],
      ['zero', '0'],
      ['negative', '-100'],
      ['excessively large', '10485761'],
    ])('should reject %s --chunk-size (%s)', async (_label, value) => {
      await loadAndRegister();
      await expect(
        program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--chunk-size', value]),
      ).rejects.toThrow(/chunk-size/i);
    });

    it('should accept valid --chunk-size', async () => {
      await loadAndRegister();
      await program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--chunk-size', '3200']);

      expect(mockTranslate).toHaveBeenCalledWith(
        'recording.ogg',
        expect.objectContaining({ chunkSize: 3200 }),
      );
    });

    it.each([
      ['non-numeric', 'xyz'],
      ['zero', '0'],
      ['negative', '-50'],
      ['excessively large', '60001'],
    ])('should reject %s --chunk-interval (%s)', async (_label, value) => {
      await loadAndRegister();
      await expect(
        program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--chunk-interval', value]),
      ).rejects.toThrow(/chunk-interval/i);
    });

    it('should accept valid --chunk-interval', async () => {
      await loadAndRegister();
      await program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--chunk-interval', '100']);

      expect(mockTranslate).toHaveBeenCalledWith(
        'recording.ogg',
        expect.objectContaining({ chunkInterval: 100 }),
      );
    });

    it.each([
      ['non-numeric', 'abc'],
      ['negative', '-1'],
      ['excessively large', '101'],
    ])('should reject %s --max-reconnect-attempts (%s)', async (_label, value) => {
      await loadAndRegister();
      await expect(
        program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--max-reconnect-attempts', value]),
      ).rejects.toThrow(/max-reconnect-attempts/i);
    });

    it.each([
      ['zero (disable reconnection)', '0', 0],
      ['valid', '5', 5],
    ])('should accept %s --max-reconnect-attempts (%s)', async (_label, value, expected) => {
      await loadAndRegister();
      await program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--max-reconnect-attempts', value]);

      expect(mockTranslate).toHaveBeenCalledWith(
        'recording.ogg',
        expect.objectContaining({ maxReconnectAttempts: expected }),
      );
    });
  });
});
