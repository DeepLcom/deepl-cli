/**
 * Voice API type definitions
 * Types for DeepL Voice API real-time speech transcription and translation.
 */


// Source languages supported by the Voice API (18 languages)
export type VoiceSourceLanguage =
  | 'ar'
  | 'bg'
  | 'cs'
  | 'da'
  | 'de'
  | 'el'
  | 'en'
  | 'es'
  | 'et'
  | 'fi'
  | 'fr'
  | 'hu'
  | 'id'
  | 'it'
  | 'ja'
  | 'ko'
  | 'lt'
  | 'lv'
  | 'nb'
  | 'nl'
  | 'pl'
  | 'pt'
  | 'ro'
  | 'ru'
  | 'sk'
  | 'sl'
  | 'sv'
  | 'tr'
  | 'uk'
  | 'zh';

// Target languages supported by the Voice API
export type VoiceTargetLanguage =
  | 'ar'
  | 'bg'
  | 'cs'
  | 'da'
  | 'de'
  | 'el'
  | 'en'
  | 'en-GB'
  | 'en-US'
  | 'es'
  | 'et'
  | 'fi'
  | 'fr'
  | 'he'
  | 'hu'
  | 'id'
  | 'it'
  | 'ja'
  | 'ko'
  | 'lt'
  | 'lv'
  | 'nb'
  | 'nl'
  | 'pl'
  | 'pt'
  | 'pt-BR'
  | 'pt-PT'
  | 'ro'
  | 'ru'
  | 'sk'
  | 'sl'
  | 'sv'
  | 'th'
  | 'tr'
  | 'uk'
  | 'vi'
  | 'zh'
  | 'zh-HANS'
  | 'zh-HANT';

// Audio content types supported by the Voice API
export type VoiceSourceMediaContentType =
  | 'audio/auto'
  | 'audio/pcm;encoding=s16le;rate=8000'
  | 'audio/pcm;encoding=s16le;rate=16000'
  | 'audio/pcm;encoding=s16le;rate=44100'
  | 'audio/pcm;encoding=s16le;rate=48000'
  | 'audio/opus;container=ogg'
  | 'audio/opus;container=webm'
  | 'audio/opus;container=matroska'
  | 'audio/ogg'
  | 'audio/ogg;codecs=flac'
  | 'audio/ogg;codecs=opus'
  | 'audio/webm'
  | 'audio/webm;codecs=opus'
  | 'audio/x-matroska'
  | 'audio/x-matroska;codecs=aac'
  | 'audio/x-matroska;codecs=flac'
  | 'audio/x-matroska;codecs=mp3'
  | 'audio/x-matroska;codecs=opus'
  | 'audio/flac'
  | 'audio/mpeg';

export type VoiceSourceLanguageMode = 'auto' | 'fixed';

// Voice-specific formality values (differs from text translation API)
export type VoiceFormality = 'default' | 'formal' | 'more' | 'informal' | 'less';

// REST endpoint: POST /v3/voice/realtime

export interface VoiceSessionRequest {
  source_language?: VoiceSourceLanguage;
  source_language_mode?: VoiceSourceLanguageMode;
  target_languages: VoiceTargetLanguage[];
  source_media_content_type: VoiceSourceMediaContentType;
  formality?: VoiceFormality;
  glossary_id?: string;
}

export interface VoiceSessionResponse {
  streaming_url: string;
  token: string;
  session_id: string;
}

export interface VoiceReconnectResponse {
  streaming_url: string;
  token: string;
}

// WebSocket server → client messages
// Messages use a nested key format: { "source_transcript_update": { ... } }

export interface VoiceTranscriptSegment {
  text: string;
  language?: string;
  start_time: number;
  end_time: number;
}

export interface VoiceSourceTranscriptUpdate {
  concluded: VoiceTranscriptSegment[];
  tentative: VoiceTranscriptSegment[];
}

export interface VoiceTargetTranscriptUpdate {
  language: VoiceTargetLanguage;
  concluded: VoiceTranscriptSegment[];
  tentative: VoiceTranscriptSegment[];
}

export interface VoiceEndOfTargetTranscript {
  language: VoiceTargetLanguage;
}

export interface VoiceErrorMessage {
  request_type: string;
  error_code: number;
  reason_code: number;
  error_message: string;
}

export interface VoiceServerMessage {
  source_transcript_update?: VoiceSourceTranscriptUpdate;
  target_transcript_update?: VoiceTargetTranscriptUpdate;
  end_of_source_transcript?: Record<string, never>;
  end_of_target_transcript?: VoiceEndOfTargetTranscript;
  end_of_stream?: Record<string, never>;
  error?: VoiceErrorMessage;
}

// Service-level types

export interface VoiceTranslateOptions {
  targetLangs: VoiceTargetLanguage[];
  sourceLang?: VoiceSourceLanguage;
  sourceLanguageMode?: VoiceSourceLanguageMode;
  formality?: VoiceFormality;
  glossaryId?: string;
  contentType?: VoiceSourceMediaContentType;
  chunkSize?: number;
  chunkInterval?: number;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
}

export interface VoiceTranscript {
  lang: string;
  text: string;
  segments: VoiceTranscriptSegment[];
}

export interface VoiceSessionResult {
  sessionId: string;
  source: VoiceTranscript;
  targets: VoiceTranscript[];
}

// Callback interface for streaming updates
export interface VoiceStreamCallbacks {
  onSourceTranscript?: (update: VoiceSourceTranscriptUpdate) => void;
  onTargetTranscript?: (update: VoiceTargetTranscriptUpdate) => void;
  onEndOfSourceTranscript?: () => void;
  onEndOfTargetTranscript?: (language: VoiceTargetLanguage) => void;
  onEndOfStream?: () => void;
  onError?: (error: VoiceErrorMessage) => void;
  onReconnecting?: (attempt: number) => void;
}
