 

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

  beforeEach(() => {
    resetAllMockImplementations();

    program = new Command();
    program.exitOverride();
    handleError = jest.fn((err: unknown) => {
      throw err;
    });
    getApiKeyAndOptions = jest.fn().mockReturnValue({
      apiKey: 'test-key',
      options: {},
    });
  });

  async function loadAndRegister() {
    const { registerVoice } = await import('../../src/cli/commands/register-voice');
    registerVoice(program, { getApiKeyAndOptions, handleError } as any);
  }

  it('should register voice command with correct description', async () => {
    await loadAndRegister();

    const voiceCmd = program.commands.find((c) => c.name() === 'voice');
    expect(voiceCmd).toBeDefined();
    expect(voiceCmd!.description()).toBe(
      'Translate audio using DeepL Voice API (real-time speech translation)',
    );
  });

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
    it('should reject non-numeric --chunk-size', async () => {
      await loadAndRegister();
      await expect(
        program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--chunk-size', 'abc']),
      ).rejects.toThrow(/chunk-size/i);
    });

    it('should reject zero --chunk-size', async () => {
      await loadAndRegister();
      await expect(
        program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--chunk-size', '0']),
      ).rejects.toThrow(/chunk-size/i);
    });

    it('should reject negative --chunk-size', async () => {
      await loadAndRegister();
      await expect(
        program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--chunk-size', '-100']),
      ).rejects.toThrow(/chunk-size/i);
    });

    it('should reject excessively large --chunk-size', async () => {
      await loadAndRegister();
      await expect(
        program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--chunk-size', '10485761']),
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

    it('should reject non-numeric --chunk-interval', async () => {
      await loadAndRegister();
      await expect(
        program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--chunk-interval', 'xyz']),
      ).rejects.toThrow(/chunk-interval/i);
    });

    it('should reject zero --chunk-interval', async () => {
      await loadAndRegister();
      await expect(
        program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--chunk-interval', '0']),
      ).rejects.toThrow(/chunk-interval/i);
    });

    it('should reject negative --chunk-interval', async () => {
      await loadAndRegister();
      await expect(
        program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--chunk-interval', '-50']),
      ).rejects.toThrow(/chunk-interval/i);
    });

    it('should reject excessively large --chunk-interval', async () => {
      await loadAndRegister();
      await expect(
        program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--chunk-interval', '60001']),
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

    it('should reject non-numeric --max-reconnect-attempts', async () => {
      await loadAndRegister();
      await expect(
        program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--max-reconnect-attempts', 'abc']),
      ).rejects.toThrow(/max-reconnect-attempts/i);
    });

    it('should reject negative --max-reconnect-attempts', async () => {
      await loadAndRegister();
      await expect(
        program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--max-reconnect-attempts', '-1']),
      ).rejects.toThrow(/max-reconnect-attempts/i);
    });

    it('should reject excessively large --max-reconnect-attempts', async () => {
      await loadAndRegister();
      await expect(
        program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--max-reconnect-attempts', '101']),
      ).rejects.toThrow(/max-reconnect-attempts/i);
    });

    it('should accept zero --max-reconnect-attempts (disable reconnection)', async () => {
      await loadAndRegister();
      await program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--max-reconnect-attempts', '0']);

      expect(mockTranslate).toHaveBeenCalledWith(
        'recording.ogg',
        expect.objectContaining({ maxReconnectAttempts: 0 }),
      );
    });

    it('should accept valid --max-reconnect-attempts', async () => {
      await loadAndRegister();
      await program.parseAsync(['node', 'test', 'voice', 'recording.ogg', '--to', 'de', '--max-reconnect-attempts', '5']);

      expect(mockTranslate).toHaveBeenCalledWith(
        'recording.ogg',
        expect.objectContaining({ maxReconnectAttempts: 5 }),
      );
    });
  });
});
