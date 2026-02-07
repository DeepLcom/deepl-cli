/**
 * Voice API type definitions
 * Types for DeepL Voice API real-time speech transcription and translation.
 */

import { Formality } from './common.js';

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

// Target languages supported by the Voice API (35+ languages)
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
  | 'tr'
  | 'uk'
  | 'zh';

// Audio content types supported by the Voice API
export type VoiceSourceMediaContentType =
  | 'audio/pcm;encoding=s16le;rate=16000'
  | 'audio/opus;container=ogg'
  | 'audio/opus;container=webm'
  | 'audio/opus;container=matroska'
  | 'audio/flac'
  | 'audio/mpeg';

// REST endpoint: POST /v3/voice/realtime

export interface VoiceSessionTarget {
  lang: VoiceTargetLanguage;
  formality?: Formality;
  glossary_id?: string;
}

export interface VoiceSessionRequest {
  source_lang?: VoiceSourceLanguage;
  target_langs: VoiceSessionTarget[];
  source_media_content_type: VoiceSourceMediaContentType;
}

export interface VoiceSessionResponse {
  streaming_url: string;
  token: string;
  session_id: string;
}

// WebSocket client → server messages

export interface VoiceAudioChunkMessage {
  type: 'audio_chunk';
  data: string; // base64-encoded audio
}

export interface VoiceEndOfSourceMessage {
  type: 'end_of_source_media';
}

// WebSocket server → client messages

export interface VoiceTranscriptSegment {
  text: string;
  start_time: number;
  end_time: number;
}

export interface VoiceSourceTranscriptUpdate {
  type: 'source_transcript_update';
  lang: VoiceSourceLanguage;
  concluded: VoiceTranscriptSegment[];
  tentative: VoiceTranscriptSegment[];
}

export interface VoiceTargetTranscriptUpdate {
  type: 'target_transcript_update';
  lang: VoiceTargetLanguage;
  concluded: VoiceTranscriptSegment[];
  tentative: VoiceTranscriptSegment[];
}

export interface VoiceEndOfSourceTranscript {
  type: 'end_of_source_transcript';
}

export interface VoiceEndOfTargetTranscript {
  type: 'end_of_target_transcript';
  lang: VoiceTargetLanguage;
}

export interface VoiceEndOfStream {
  type: 'end_of_stream';
}

export interface VoiceErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export type VoiceServerMessage =
  | VoiceSourceTranscriptUpdate
  | VoiceTargetTranscriptUpdate
  | VoiceEndOfSourceTranscript
  | VoiceEndOfTargetTranscript
  | VoiceEndOfStream
  | VoiceErrorMessage;

// Service-level types

export interface VoiceTranslateOptions {
  targetLangs: VoiceTargetLanguage[];
  sourceLang?: VoiceSourceLanguage;
  formality?: Formality;
  glossaryId?: string;
  contentType?: VoiceSourceMediaContentType;
  chunkSize?: number;
  chunkInterval?: number;
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
  onEndOfTargetTranscript?: (lang: VoiceTargetLanguage) => void;
  onEndOfStream?: () => void;
  onError?: (error: VoiceErrorMessage) => void;
}
