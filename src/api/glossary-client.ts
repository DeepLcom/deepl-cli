import { HttpClient, DeepLClientOptions } from './http-client.js';
import { Language, GlossaryInfo, GlossaryLanguagePair } from '../types';
import { normalizeGlossaryInfo, GlossaryApiResponse } from '../types/glossary.js';

interface DeepLGlossaryLanguagePairsResponse {
  supported_languages: Array<{
    source_lang: string;
    target_lang: string;
  }>;
}

export class GlossaryClient extends HttpClient {
  constructor(apiKey: string, options: DeepLClientOptions = {}) {
    super(apiKey, options);
  }

  async getGlossaryLanguages(): Promise<GlossaryLanguagePair[]> {
    try {
      const response = await this.makeRequest<DeepLGlossaryLanguagePairsResponse>(
        'GET',
        '/v2/glossary-language-pairs'
      );

      return response.supported_languages.map((pair) => ({
        sourceLang: this.normalizeLanguage(pair.source_lang),
        targetLang: this.normalizeLanguage(pair.target_lang),
      }));
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async createGlossary(
    name: string,
    sourceLang: Language,
    targetLangs: Language[],
    entries: string
  ): Promise<GlossaryInfo> {
    if (targetLangs.length === 0) {
      throw new Error('At least one target language is required');
    }

    try {
      const dictionaries = targetLangs.map(targetLang => ({
        source_lang: sourceLang.toUpperCase(),
        target_lang: targetLang.toUpperCase(),
        entries,
        entries_format: 'tsv',
      }));

      const response = await this.makeJsonRequest<GlossaryApiResponse>(
        'POST', '/v3/glossaries',
        { name, dictionaries } as unknown as Record<string, unknown>
      );

      return normalizeGlossaryInfo(response);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async listGlossaries(): Promise<GlossaryInfo[]> {
    try {
      const response = await this.makeRequest<{ glossaries: GlossaryApiResponse[] }>(
        'GET',
        '/v3/glossaries'
      );

      return (response.glossaries || []).map(normalizeGlossaryInfo);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getGlossary(glossaryId: string): Promise<GlossaryInfo> {
    this.validateGlossaryId(glossaryId);
    try {
      const response = await this.makeRequest<GlossaryApiResponse>(
        'GET',
        `/v3/glossaries/${glossaryId}`
      );

      return normalizeGlossaryInfo(response);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async deleteGlossary(glossaryId: string): Promise<void> {
    this.validateGlossaryId(glossaryId);
    try {
      await this.makeRequest<void>(
        'DELETE',
        `/v3/glossaries/${glossaryId}`
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getGlossaryEntries(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language
  ): Promise<string> {
    this.validateGlossaryId(glossaryId);
    try {
      const response = await this.makeJsonRequest<{
        dictionaries: Array<{
          source_lang: string;
          target_lang: string;
          entries: string;
          entries_format: string;
        }>;
      }>('GET', `/v3/glossaries/${glossaryId}/entries`, {
        source_lang: sourceLang.toUpperCase(),
        target_lang: targetLang.toUpperCase(),
      });

      if (!response.dictionaries || response.dictionaries.length === 0) {
        return '';
      }

      const dictionary = response.dictionaries[0];
      if (!dictionary) {
        return '';
      }

      return dictionary.entries;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateGlossaryEntries(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language,
    entries: string
  ): Promise<void> {
    this.validateGlossaryId(glossaryId);
    try {
      await this.makeRequest<void>(
        'PATCH',
        `/v3/glossaries/${glossaryId}/dictionaries/${sourceLang.toUpperCase()}-${targetLang.toUpperCase()}`,
        {
          entries,
          entries_format: 'tsv',
        }
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async replaceGlossaryDictionary(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language,
    entries: string
  ): Promise<void> {
    this.validateGlossaryId(glossaryId);
    try {
      await this.makeRequest<void>(
        'PUT',
        `/v3/glossaries/${glossaryId}/dictionaries/${sourceLang.toUpperCase()}-${targetLang.toUpperCase()}`,
        {
          entries,
          entries_format: 'tsv',
        }
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async renameGlossary(glossaryId: string, newName: string): Promise<void> {
    this.validateGlossaryId(glossaryId);
    try {
      await this.makeRequest<void>(
        'PATCH',
        `/v3/glossaries/${glossaryId}`,
        {
          name: newName,
        }
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async deleteGlossaryDictionary(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language
  ): Promise<void> {
    this.validateGlossaryId(glossaryId);
    try {
      await this.makeRequest<void>(
        'DELETE',
        `/v3/glossaries/${glossaryId}/dictionaries/${sourceLang.toUpperCase()}-${targetLang.toUpperCase()}`
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private validateGlossaryId(glossaryId: string): void {
    if (!/^[a-zA-Z0-9-]+$/.test(glossaryId)) {
      throw new Error('Invalid glossary ID format');
    }
  }
}
