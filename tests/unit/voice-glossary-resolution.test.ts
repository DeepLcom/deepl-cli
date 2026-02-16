/**
 * Unit Tests for Voice Command Glossary Name-or-ID Resolution
 * Tests that the voice command resolves glossary names to IDs before translation.
 */

import { Command } from 'commander';

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

function resetAllMockImplementations() {
  mockTranslate.mockResolvedValue('Translated audio text');
  mockTranslateFromStdin.mockResolvedValue('Translated stdin text');

  const { createVoiceCommand } = require('../../src/cli/commands/service-factory');
  createVoiceCommand.mockResolvedValue(mockVoiceCmdObj);
}

describe('Voice Glossary Resolution', () => {
  let program: Command;
  let handleError: jest.Mock;
  let getApiKeyAndOptions: jest.Mock;
  let createDeepLClient: jest.Mock;

  beforeEach(() => {
    resetAllMockImplementations();
    mockResolveGlossaryId.mockReset();

    // Re-setup the GlossaryService constructor mock (clearAllMocks would clear it)
    const { GlossaryService } = require('../../src/services/glossary');
    GlossaryService.mockImplementation(() => ({
      resolveGlossaryId: mockResolveGlossaryId,
    }));

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

  it('should pass UUID glossary through resolveGlossaryId', async () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    mockResolveGlossaryId.mockResolvedValue(uuid);

    await loadAndRegister();
    await program.parseAsync(['node', 'test', 'voice', 'test.ogg', '--to', 'de', '--glossary', uuid]);

    expect(createDeepLClient).toHaveBeenCalled();
    expect(mockResolveGlossaryId).toHaveBeenCalledWith(uuid);
    expect(mockTranslate).toHaveBeenCalledWith(
      'test.ogg',
      expect.objectContaining({ glossary: uuid }),
    );
  });

  it('should resolve glossary name to ID via GlossaryService', async () => {
    const resolvedId = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';
    mockResolveGlossaryId.mockResolvedValue(resolvedId);

    await loadAndRegister();
    await program.parseAsync(['node', 'test', 'voice', 'test.ogg', '--to', 'de', '--glossary', 'my-glossary']);

    expect(createDeepLClient).toHaveBeenCalled();
    expect(mockResolveGlossaryId).toHaveBeenCalledWith('my-glossary');
    expect(mockTranslate).toHaveBeenCalledWith(
      'test.ogg',
      expect.objectContaining({ glossary: resolvedId }),
    );
  });

  it('should not create DeepLClient or call resolveGlossaryId when no glossary is specified', async () => {
    await loadAndRegister();
    await program.parseAsync(['node', 'test', 'voice', 'test.ogg', '--to', 'de']);

    expect(createDeepLClient).not.toHaveBeenCalled();
    expect(mockResolveGlossaryId).not.toHaveBeenCalled();
  });

  it('should propagate errors from glossary resolution via handleError', async () => {
    mockResolveGlossaryId.mockRejectedValue(new Error('Glossary "unknown" not found'));

    await loadAndRegister();
    await expect(
      program.parseAsync(['node', 'test', 'voice', 'test.ogg', '--to', 'de', '--glossary', 'unknown']),
    ).rejects.toThrow('Glossary "unknown" not found');

    expect(handleError).toHaveBeenCalled();
  });
});
