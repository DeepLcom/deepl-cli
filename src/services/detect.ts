import { DeepLClient } from '../api/deepl-client.js';
import { Language } from '../types/index.js';
import { getLanguageName } from '../data/language-registry.js';
import { ValidationError } from '../utils/errors.js';

export interface DetectResult {
  detectedLanguage: Language;
  languageName: string;
}

export class DetectService {
  private client: DeepLClient;

  constructor(client: DeepLClient) {
    this.client = client;
  }

  async detect(text: string): Promise<DetectResult> {
    if (!text || text.trim() === '') {
      throw new ValidationError('Text cannot be empty. Provide text to detect language.');
    }

    const result = await this.client.translate(text, {
      targetLang: 'en' as Language,
    });

    if (!result.detectedSourceLang) {
      throw new ValidationError('Could not detect source language. The text may be too short or ambiguous.');
    }

    const langCode = result.detectedSourceLang;
    const langName = getLanguageName(langCode) ?? langCode.toUpperCase();

    return {
      detectedLanguage: langCode,
      languageName: langName,
    };
  }
}
