/**
 * Tests for Voice types validation and VoiceError class
 */

import { VoiceError } from '../../src/utils/errors.js';
import { ExitCode, getExitCodeFromError } from '../../src/utils/exit-codes.js';
import { formatVoiceJson } from '../../src/utils/formatters.js';
import type { VoiceSessionResult } from '../../src/types/voice.js';

describe('VoiceError', () => {
  it('should be an instance of Error', () => {
    const error = new VoiceError('test error');
    expect(error).toBeInstanceOf(Error);
  });

  it('should have exitCode 9', () => {
    const error = new VoiceError('test error');
    expect(error.exitCode).toBe(9);
  });

  it('should have default suggestion about Pro plan', () => {
    const error = new VoiceError('test error');
    expect(error.suggestion).toContain('Pro');
    expect(error.suggestion).toContain('deepl.com');
  });

  it('should allow custom suggestion', () => {
    const error = new VoiceError('test error', 'Custom suggestion');
    expect(error.suggestion).toBe('Custom suggestion');
  });

  it('should set correct name', () => {
    const error = new VoiceError('test');
    expect(error.name).toBe('VoiceError');
  });

  it('should preserve message', () => {
    const error = new VoiceError('Voice API not available');
    expect(error.message).toBe('Voice API not available');
  });
});

describe('ExitCode.VoiceError', () => {
  it('should have value 9', () => {
    expect(ExitCode.VoiceError).toBe(9);
  });

  it('should return VoiceError exit code for VoiceError instances', () => {
    const error = new VoiceError('test');
    expect(getExitCodeFromError(error)).toBe(ExitCode.VoiceError);
  });

  it('should classify "voice api" messages as VoiceError', () => {
    const error = new Error('Voice API not available');
    expect(getExitCodeFromError(error)).toBe(ExitCode.VoiceError);
  });

  it('should classify "voice session" messages as VoiceError', () => {
    const error = new Error('Voice session creation failed');
    expect(getExitCodeFromError(error)).toBe(ExitCode.VoiceError);
  });
});

describe('formatVoiceJson()', () => {
  const mockResult: VoiceSessionResult = {
    sessionId: 'session-123',
    source: {
      lang: 'en',
      text: 'Hello world',
      segments: [
        { text: 'Hello world', start_time: 0, end_time: 1.5 },
      ],
    },
    targets: [
      {
        lang: 'de',
        text: 'Hallo Welt',
        segments: [
          { text: 'Hallo Welt', start_time: 0, end_time: 1.5 },
        ],
      },
    ],
  };

  it('should return valid JSON', () => {
    const json = formatVoiceJson(mockResult);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('should include sessionId', () => {
    const parsed = JSON.parse(formatVoiceJson(mockResult));
    expect(parsed.sessionId).toBe('session-123');
  });

  it('should include source transcript', () => {
    const parsed = JSON.parse(formatVoiceJson(mockResult));
    expect(parsed.source.lang).toBe('en');
    expect(parsed.source.text).toBe('Hello world');
  });

  it('should include target transcripts', () => {
    const parsed = JSON.parse(formatVoiceJson(mockResult));
    expect(parsed.targets).toHaveLength(1);
    expect(parsed.targets[0].lang).toBe('de');
    expect(parsed.targets[0].text).toBe('Hallo Welt');
  });

  it('should convert segment times to camelCase', () => {
    const parsed = JSON.parse(formatVoiceJson(mockResult));
    expect(parsed.source.segments[0].startTime).toBe(0);
    expect(parsed.source.segments[0].endTime).toBe(1.5);
    expect(parsed.source.segments[0].start_time).toBeUndefined();
  });

  it('should handle multiple targets', () => {
    const multiResult: VoiceSessionResult = {
      ...mockResult,
      targets: [
        { lang: 'de', text: 'Hallo', segments: [] },
        { lang: 'fr', text: 'Bonjour', segments: [] },
        { lang: 'es', text: 'Hola', segments: [] },
      ],
    };

    const parsed = JSON.parse(formatVoiceJson(multiResult));
    expect(parsed.targets).toHaveLength(3);
    expect(parsed.targets[0].lang).toBe('de');
    expect(parsed.targets[1].lang).toBe('fr');
    expect(parsed.targets[2].lang).toBe('es');
  });

  it('should handle empty segments', () => {
    const emptyResult: VoiceSessionResult = {
      sessionId: 'session-empty',
      source: { lang: 'auto', text: '', segments: [] },
      targets: [{ lang: 'de', text: '', segments: [] }],
    };

    const parsed = JSON.parse(formatVoiceJson(emptyResult));
    expect(parsed.source.segments).toHaveLength(0);
    expect(parsed.targets[0].segments).toHaveLength(0);
  });

  it('should handle multiple segments', () => {
    const multiSegResult: VoiceSessionResult = {
      sessionId: 'session-multi-seg',
      source: {
        lang: 'en',
        text: 'Hello world',
        segments: [
          { text: 'Hello', start_time: 0, end_time: 0.5 },
          { text: 'world', start_time: 0.5, end_time: 1 },
        ],
      },
      targets: [{ lang: 'de', text: 'Hallo Welt', segments: [] }],
    };

    const parsed = JSON.parse(formatVoiceJson(multiSegResult));
    expect(parsed.source.segments).toHaveLength(2);
    expect(parsed.source.segments[0].text).toBe('Hello');
    expect(parsed.source.segments[1].text).toBe('world');
  });

  it('should produce pretty-printed JSON', () => {
    const json = formatVoiceJson(mockResult);
    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });
});
