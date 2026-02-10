import { DeepLClient } from '../../api/deepl-client.js';
import { Language } from '../../types/index.js';
import { getLanguageName } from '../../data/language-registry.js';

export interface DetectResult {
  detectedLanguage: Language;
  languageName: string;
}

export class DetectCommand {
  private client: DeepLClient;

  constructor(client: DeepLClient) {
    this.client = client;
  }

  async detect(text: string): Promise<DetectResult> {
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty. Provide text to detect language.');
    }

    const result = await this.client.translate(text, {
      targetLang: 'en' as Language,
    });

    if (!result.detectedSourceLang) {
      throw new Error('Could not detect source language. The text may be too short or ambiguous.');
    }

    const langCode = result.detectedSourceLang;
    const langName = getLanguageName(langCode) ?? langCode.toUpperCase();

    return {
      detectedLanguage: langCode,
      languageName: langName,
    };
  }

  formatPlain(result: DetectResult): string {
    return `Detected language: ${result.languageName} (${result.detectedLanguage})`;
  }

  formatJson(result: DetectResult): string {
    return JSON.stringify({
      detected_language: result.detectedLanguage,
      language_name: result.languageName,
    }, null, 2);
  }
}
