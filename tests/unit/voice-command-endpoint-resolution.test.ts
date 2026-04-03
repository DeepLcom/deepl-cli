/**
 * Tests for voice endpoint resolution at the service-factory boundary.
 *
 * Endpoint policy should be centralized before VoiceClient construction,
 * not inferred inside the VoiceClient constructor itself.
 */

jest.mock('ws', () => {
  const { EventEmitter } = require('events');
  class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1;
    send = jest.fn();
    close = jest.fn();
  }
  return { default: MockWebSocket, __esModule: true };
});

jest.mock('chalk', () => {
  const passthrough = (s: string) => s;
  return {
    __esModule: true,
    default: {
      red: passthrough,
      green: passthrough,
      blue: passthrough,
      yellow: passthrough,
      gray: passthrough,
      bold: passthrough,
      level: 3,
    },
  };
});

jest.mock('../../src/api/voice-client.js', () => ({
  VoiceClient: jest.fn().mockImplementation(() => ({
    createSession: jest.fn(),
    reconnectSession: jest.fn(),
    createWebSocket: jest.fn(),
    sendAudioChunk: jest.fn(),
    sendEndOfSource: jest.fn(),
  })),
}));

jest.mock('../../src/services/voice.js', () => ({
  VoiceService: jest.fn().mockImplementation(() => ({
    translate: jest.fn(),
    translateFromStdin: jest.fn(),
  })),
}));

jest.mock('../../src/cli/commands/voice.js', () => ({
  VoiceCommand: jest.fn().mockImplementation(() => ({
    translate: jest.fn(),
    translateFromStdin: jest.fn(),
  })),
}));

describe('createVoiceCommand endpoint resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass api-free.deepl.com to VoiceClient for :fx key', async () => {
    const getApiKeyAndOptions = jest.fn().mockReturnValue({
      apiKey: 'test-key:fx',
      options: { baseUrl: 'https://api-free.deepl.com' },
    });

    const { createVoiceCommand } =
      await import('../../src/cli/commands/service-factory.js');
    await createVoiceCommand(getApiKeyAndOptions);

    const { VoiceClient } = require('../../src/api/voice-client');
    expect(VoiceClient).toHaveBeenCalledWith('test-key:fx', {
      baseUrl: 'https://api-free.deepl.com',
    });
  });

  it('should pass api.deepl.com to VoiceClient for non-:fx key', async () => {
    const getApiKeyAndOptions = jest.fn().mockReturnValue({
      apiKey: 'test-key-pro',
      options: { baseUrl: 'https://api.deepl.com' },
    });

    const { createVoiceCommand } =
      await import('../../src/cli/commands/service-factory.js');
    await createVoiceCommand(getApiKeyAndOptions);

    const { VoiceClient } = require('../../src/api/voice-client');
    expect(VoiceClient).toHaveBeenCalledWith('test-key-pro', {
      baseUrl: 'https://api.deepl.com',
    });
  });

  it('should preserve custom regional URL for :fx key', async () => {
    const getApiKeyAndOptions = jest.fn().mockReturnValue({
      apiKey: 'test-key:fx',
      options: { baseUrl: 'https://api-jp.deepl.com' },
    });

    const { createVoiceCommand } =
      await import('../../src/cli/commands/service-factory.js');
    await createVoiceCommand(getApiKeyAndOptions);

    const { VoiceClient } = require('../../src/api/voice-client');
    expect(VoiceClient).toHaveBeenCalledWith('test-key:fx', {
      baseUrl: 'https://api-jp.deepl.com',
    });
  });

  it('should preserve localhost URL for :fx key', async () => {
    const getApiKeyAndOptions = jest.fn().mockReturnValue({
      apiKey: 'test-key:fx',
      options: { baseUrl: 'http://localhost:8080' },
    });

    const { createVoiceCommand } =
      await import('../../src/cli/commands/service-factory.js');
    await createVoiceCommand(getApiKeyAndOptions);

    const { VoiceClient } = require('../../src/api/voice-client');
    expect(VoiceClient).toHaveBeenCalledWith('test-key:fx', {
      baseUrl: 'http://localhost:8080',
    });
  });
});
