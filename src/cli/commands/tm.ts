import type { DeepLClient } from '../../api/deepl-client.js';
import type { TranslationMemory } from '../../types/index.js';

// Strip ASCII control chars and zero-width codepoints so a malicious
// API-returned TM name cannot corrupt the terminal via escape sequences
// or hide characters via zero-width chars. Same character class the
// TM resolver filters on.
function sanitizeName(name: string): string {
  // eslint-disable-next-line no-control-regex -- intentional: strip control chars before rendering untrusted API-returned names
  return name.replace(/[\x00-\x1f\x7f\u200B-\u200D\uFEFF]/g, '');
}

export class TmCommand {
  constructor(private client: DeepLClient) {}

  async list(): Promise<TranslationMemory[]> {
    return this.client.listTranslationMemories();
  }

  formatList(tms: TranslationMemory[]): string {
    if (tms.length === 0) {
      return 'No translation memories found';
    }
    return tms
      .map(tm => {
        const src = tm.source_language.toUpperCase();
        const targets = tm.target_languages.map(t => t.toUpperCase()).join(', ');
        return `${sanitizeName(tm.name)} (${src} \u2192 ${targets})`;
      })
      .join('\n');
  }
}
