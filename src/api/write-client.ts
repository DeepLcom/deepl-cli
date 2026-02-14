import { HttpClient, DeepLClientOptions } from './http-client.js';
import { WriteOptions, WriteImprovement } from '../types';
import { NetworkError } from '../utils/errors.js';

interface DeepLWriteResponse {
  improvements: Array<{
    text: string;
    target_language: string;
    detected_source_language?: string;
  }>;
}

export class WriteClient extends HttpClient {
  constructor(apiKey: string, options: DeepLClientOptions = {}) {
    super(apiKey, options);
  }

  async improveText(
    text: string,
    options: WriteOptions
  ): Promise<WriteImprovement[]> {
    const params: Record<string, string | string[]> = {
      text: [text],
    };

    if (options.targetLang) {
      params['target_lang'] = options.targetLang;
    }

    if (options.writingStyle) {
      params['writing_style'] = options.writingStyle;
    }

    if (options.tone) {
      params['tone'] = options.tone;
    }

    try {
      const response = await this.makeRequest<DeepLWriteResponse>(
        'POST',
        '/v2/write/rephrase',
        params
      );

      if (!response.improvements || response.improvements.length === 0) {
        throw new NetworkError('No improvements returned');
      }

      return response.improvements.map(improvement => ({
        text: improvement.text,
        targetLanguage: improvement.target_language as WriteImprovement['targetLanguage'],
        detectedSourceLanguage: improvement.detected_source_language,
      }));
    } catch (error) {
      throw this.handleError(error);
    }
  }
}
