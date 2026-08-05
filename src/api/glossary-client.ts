import { HttpClient, DeepLClientOptions } from './http-client.js';
import {
  Language,
  GlossaryInfo,
  GlossaryLanguagePair,
  normalizeGlossaryInfo,
  GlossaryApiResponse,
} from '../types/index.js';
import { ValidationError } from '../utils/errors.js';

interface DeepLV3GlossaryLanguageResponse {
  lang: string;
  usable_as_source?: boolean;
  usable_as_target?: boolean;
}

export class GlossaryClient extends HttpClient {
  constructor(apiKey: string, options: DeepLClientOptions = {}) {
    super(apiKey, options);
  }

  /**
   * Lists glossary language pairs via GET /v3/languages?resource=glossary
   * (the v2 pairs endpoint is deprecated). v3 returns one role-flagged
   * language list instead of pairs; the source×target cross-product minus
   * identity reproduces the v2 pair set exactly (verified live: 992 pairs,
   * zero difference in either direction).
   */
  async getGlossaryLanguages(): Promise<GlossaryLanguagePair[]> {
    const response = await this.makeRequest<DeepLV3GlossaryLanguageResponse[]>(
      'GET',
      '/v3/languages',
      { resource: 'glossary' }
    );

    // `!== false`, not truthiness: an absent flag is not a denial, and the
    // language registry reads it the same way.
    const sources = response.filter((lang) => lang.usable_as_source !== false);
    const targets = response.filter((lang) => lang.usable_as_target !== false);

    const pairs: GlossaryLanguagePair[] = [];
    for (const source of sources) {
      for (const target of targets) {
        // Compared after normalization, so casing differing between the two role
        // lists cannot emit a self-pair the API does not offer.
        const sourceLang = this.normalizeLanguage(source.lang);
        const targetLang = this.normalizeLanguage(target.lang);
        if (sourceLang === targetLang) {
          continue;
        }
        pairs.push({ sourceLang, targetLang });
      }
    }
    return pairs;
  }

  async createGlossary(
    name: string,
    sourceLang: Language,
    targetLangs: Language[],
    entries: string
  ): Promise<GlossaryInfo> {
    if (targetLangs.length === 0) {
      throw new ValidationError('At least one target language is required');
    }

    const dictionaries = targetLangs.map((targetLang) => ({
      source_lang: sourceLang.toUpperCase(),
      target_lang: targetLang.toUpperCase(),
      entries,
      entries_format: 'tsv',
    }));

    const response = await this.makeJsonRequest<GlossaryApiResponse>(
      'POST',
      '/v3/glossaries',
      { name, dictionaries }
    );

    return normalizeGlossaryInfo(response);
  }

  async listGlossaries(): Promise<GlossaryInfo[]> {
    try {
      const response = await this.makeRequest<{
        glossaries: GlossaryApiResponse[];
      }>('GET', '/v3/glossaries');

      return (response.glossaries || []).map((g) =>
        normalizeGlossaryInfo(g, { warnOnEmpty: false })
      );
    } catch (error) {
      throw this.handleError(error, 'listGlossaries');
    }
  }

  async getGlossary(glossaryId: string): Promise<GlossaryInfo> {
    this.validateGlossaryId(glossaryId);
    const response = await this.makeRequest<GlossaryApiResponse>(
      'GET',
      `/v3/glossaries/${glossaryId}`
    );

    return normalizeGlossaryInfo(response);
  }

  async deleteGlossary(glossaryId: string): Promise<void> {
    this.validateGlossaryId(glossaryId);
    await this.makeRequest<void>('DELETE', `/v3/glossaries/${glossaryId}`);
  }

  async getGlossaryEntries(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language
  ): Promise<string> {
    this.validateGlossaryId(glossaryId);
    const response = await this.makeRequest<{
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
  }

  async updateGlossaryEntries(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language,
    entries: string
  ): Promise<void> {
    this.validateGlossaryId(glossaryId);
    await this.makeJsonRequest<void>('PATCH', `/v3/glossaries/${glossaryId}`, {
      dictionaries: [
        {
          source_lang: sourceLang.toUpperCase(),
          target_lang: targetLang.toUpperCase(),
          entries,
          entries_format: 'tsv',
        },
      ],
    });
  }

  async replaceGlossaryDictionary(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language,
    entries: string
  ): Promise<void> {
    this.validateGlossaryId(glossaryId);
    await this.makeJsonRequest<void>(
      'PUT',
      `/v3/glossaries/${glossaryId}/dictionaries`,
      {
        source_lang: sourceLang.toUpperCase(),
        target_lang: targetLang.toUpperCase(),
        entries,
        entries_format: 'tsv',
      }
    );
  }

  async updateGlossary(
    glossaryId: string,
    updates: {
      name?: string;
      dictionaries?: Array<{
        source_lang: string;
        target_lang: string;
        entries: string;
        entries_format: string;
      }>;
    }
  ): Promise<void> {
    this.validateGlossaryId(glossaryId);
    if (!updates.name && !updates.dictionaries) {
      throw new ValidationError(
        'At least one of name or dictionaries must be provided'
      );
    }
    await this.makeJsonRequest<void>(
      'PATCH',
      `/v3/glossaries/${glossaryId}`,
      updates
    );
  }

  async renameGlossary(glossaryId: string, newName: string): Promise<void> {
    return this.updateGlossary(glossaryId, { name: newName });
  }

  async deleteGlossaryDictionary(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language
  ): Promise<void> {
    this.validateGlossaryId(glossaryId);
    const params = new URLSearchParams({
      source_lang: sourceLang.toUpperCase(),
      target_lang: targetLang.toUpperCase(),
    });
    await this.makeRequest<void>(
      'DELETE',
      `/v3/glossaries/${glossaryId}/dictionaries?${params.toString()}`
    );
  }

  private validateGlossaryId(glossaryId: string): void {
    if (!/^[a-zA-Z0-9-]+$/.test(glossaryId)) {
      throw new ValidationError('Invalid glossary ID format');
    }
  }
}
