/**
 * Verify that createVoiceCommand passes the resolved baseUrl through
 * to VoiceClient unchanged. One test is sufficient — the resolver
 * logic is tested in resolve-endpoint.test.ts; this pins the wiring.
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
      red: passthrough, green: passthrough, blue: passthrough,
      yellow: passthrough, gray: passthrough, bold: passthrough, level: 3,
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

it('createVoiceCommand passes resolved baseUrl to VoiceClient', async () => {
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
