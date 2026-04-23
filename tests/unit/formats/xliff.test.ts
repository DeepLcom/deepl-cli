import { createDefaultRegistry } from '../../../src/formats/index';
import { XliffFormatParser } from '../../../src/formats/xliff';
import type { TranslatedEntry } from '../../../src/formats/format';

const parser = new XliffFormatParser();

describe('xliff parser', () => {
  it('should be registered in the default registry', async () => {
    const registry = await createDefaultRegistry();
    const extensions = registry.getSupportedExtensions();
    expect(extensions.length).toBeGreaterThan(0);
  });

  describe('reconstruct removes deleted keys', () => {
    it('should remove trans-units not in entries for v1.2', () => {
      const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="de">
    <body>
      <trans-unit id="greeting">
        <source>Hello</source>
        <target>Hallo</target>
      </trans-unit>
      <trans-unit id="farewell">
        <source>Goodbye</source>
        <target>Tschüss</target>
      </trans-unit>
      <trans-unit id="deleted">
        <source>Remove me</source>
        <target>Entferne mich</target>
      </trans-unit>
    </body>
  </file>
</xliff>`;
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hallo' },
        { key: 'farewell', value: 'Goodbye', translation: 'Tschüss' },
      ];
      const result = parser.reconstruct(xliff, entries);
      expect(result).toContain('trans-unit id="greeting"');
      expect(result).toContain('trans-unit id="farewell"');
      expect(result).not.toContain('trans-unit id="deleted"');
      expect(result).not.toContain('Remove me');
    });

    it('should remove units not in entries for v2.0', () => {
      const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="de">
  <file id="f1">
    <unit id="greeting">
      <segment>
        <source>Hello</source>
        <target>Hallo</target>
      </segment>
    </unit>
    <unit id="deleted">
      <segment>
        <source>Remove me</source>
        <target>Entferne mich</target>
      </segment>
    </unit>
  </file>
</xliff>`;
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hallo' },
      ];
      const result = parser.reconstruct(xliff, entries);
      expect(result).toContain('unit id="greeting"');
      expect(result).not.toContain('unit id="deleted"');
      expect(result).not.toContain('Remove me');
    });
  });

  describe('namespace-prefixed elements', () => {
    it('should extract from XLIFF v2.0 with namespace-prefixed elements', () => {
      const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff:xliff xmlns:xliff="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="de">
  <xliff:file id="f1">
    <xliff:unit id="greeting">
      <xliff:segment>
        <xliff:source>Hello</xliff:source>
        <xliff:target>Hallo</xliff:target>
      </xliff:segment>
    </xliff:unit>
  </xliff:file>
</xliff:xliff>`;
      const entries = parser.extract(xliff);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.key).toBe('greeting');
      expect(entries[0]!.value).toBe('Hello');
    });

    it('should reconstruct XLIFF v2.0 with namespace-prefixed elements', () => {
      const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff:xliff xmlns:xliff="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="de">
  <xliff:file id="f1">
    <xliff:unit id="greeting">
      <xliff:segment>
        <xliff:source>Hello</xliff:source>
        <xliff:target>Hallo</xliff:target>
      </xliff:segment>
    </xliff:unit>
  </xliff:file>
</xliff:xliff>`;
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Bonjour' },
      ];
      const result = parser.reconstruct(xliff, entries);
      expect(result).toContain('<xliff:target>Bonjour</xliff:target>');
      expect(result).toContain('xliff:unit id="greeting"');
    });

    it('should extract from XLIFF v1.2 with namespace-prefixed elements', () => {
      const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<x:xliff version="1.2" xmlns:x="urn:oasis:names:tc:xliff:document:1.2">
  <x:file source-language="en" target-language="de">
    <x:body>
      <x:trans-unit id="msg1">
        <x:source>Welcome</x:source>
        <x:target>Willkommen</x:target>
      </x:trans-unit>
    </x:body>
  </x:file>
</x:xliff>`;
      const entries = parser.extract(xliff);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.key).toBe('msg1');
      expect(entries[0]!.value).toBe('Welcome');
    });

    it('should reconstruct XLIFF v1.2 with namespace-prefixed elements', () => {
      const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<x:xliff version="1.2" xmlns:x="urn:oasis:names:tc:xliff:document:1.2">
  <x:file source-language="en" target-language="de">
    <x:body>
      <x:trans-unit id="msg1">
        <x:source>Welcome</x:source>
        <x:target>Willkommen</x:target>
      </x:trans-unit>
    </x:body>
  </x:file>
</x:xliff>`;
      const entries: TranslatedEntry[] = [
        { key: 'msg1', value: 'Welcome', translation: 'Bienvenue' },
      ];
      const result = parser.reconstruct(xliff, entries);
      expect(result).toContain('<x:target>Bienvenue</x:target>');
      expect(result).toContain('x:trans-unit id="msg1"');
    });
  });

  describe('reconstruct v2.0 full coverage', () => {
    it('should apply translations to v2.0 with existing target', () => {
      const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="fr">
  <file id="f1">
    <unit id="greeting">
      <segment>
        <source>Hello</source>
        <target>Bonjour</target>
      </segment>
    </unit>
  </file>
</xliff>`;
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Salut' },
      ];
      const result = parser.reconstruct(xliff, entries);
      expect(result).toContain('<target>Salut</target>');
      expect(result).not.toContain('Bonjour');
    });

    it('should insert missing <target> elements in v2.0', () => {
      const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="de">
  <file id="f1">
    <unit id="msg1">
      <segment>
        <source>Hello</source>
      </segment>
    </unit>
  </file>
</xliff>`;
      const entries: TranslatedEntry[] = [
        { key: 'msg1', value: 'Hello', translation: 'Hallo' },
      ];
      const result = parser.reconstruct(xliff, entries);
      expect(result).toContain('<target>Hallo</target>');
      expect(result).toContain('<source>Hello</source>');
    });

    it('should remove deleted units in v2.0', () => {
      const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="de">
  <file id="f1">
    <unit id="kept">
      <segment>
        <source>Keep</source>
        <target>Behalten</target>
      </segment>
    </unit>
    <unit id="removed">
      <segment>
        <source>Remove</source>
        <target>Entfernen</target>
      </segment>
    </unit>
  </file>
</xliff>`;
      const entries: TranslatedEntry[] = [
        { key: 'kept', value: 'Keep', translation: 'Behalten' },
      ];
      const result = parser.reconstruct(xliff, entries);
      expect(result).toContain('unit id="kept"');
      expect(result).not.toContain('unit id="removed"');
      expect(result).not.toContain('Entfernen');
    });
  });

  describe('reconstruct v1.2 missing target insertion', () => {
    it('should insert <target> when missing in v1.2', () => {
      const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="de">
    <body>
      <trans-unit id="msg1">
        <source>Welcome</source>
      </trans-unit>
    </body>
  </file>
</xliff>`;
      const entries: TranslatedEntry[] = [
        { key: 'msg1', value: 'Welcome', translation: 'Willkommen' },
      ];
      const result = parser.reconstruct(xliff, entries);
      expect(result).toContain('<target>Willkommen</target>');
      expect(result).toContain('<source>Welcome</source>');
    });
  });

  describe('reconstruct with $-patterns in translations', () => {
    it('should preserve literal $1 and $& in v1.2 target replacement', () => {
      const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="de">
    <body>
      <trans-unit id="price">
        <source>Price</source>
        <target>Preis</target>
      </trans-unit>
    </body>
  </file>
</xliff>`;
      const entries: TranslatedEntry[] = [
        { key: 'price', value: 'Price', translation: 'Costs $1 and $& more' },
      ];
      const result = parser.reconstruct(xliff, entries);
      expect(result).toContain('<target>Costs $1 and $&amp; more</target>');
    });

    it('should preserve literal $1 and $& in v1.2 when inserting new target', () => {
      const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="de">
    <body>
      <trans-unit id="price">
        <source>Price</source>
      </trans-unit>
    </body>
  </file>
</xliff>`;
      const entries: TranslatedEntry[] = [
        { key: 'price', value: 'Price', translation: 'Pay $1 now $& later' },
      ];
      const result = parser.reconstruct(xliff, entries);
      expect(result).toContain('<target>Pay $1 now $&amp; later</target>');
    });

    it('should preserve literal $1 and $& in v2.0 target replacement', () => {
      const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="de">
  <file id="f1">
    <unit id="price">
      <segment>
        <source>Price</source>
        <target>Preis</target>
      </segment>
    </unit>
  </file>
</xliff>`;
      const entries: TranslatedEntry[] = [
        { key: 'price', value: 'Price', translation: 'Costs $1 and $& more' },
      ];
      const result = parser.reconstruct(xliff, entries);
      expect(result).toContain('<target>Costs $1 and $&amp; more</target>');
    });

    it('should preserve literal $1 and $& in v2.0 when inserting new target', () => {
      const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="de">
  <file id="f1">
    <unit id="price">
      <segment>
        <source>Price</source>
      </segment>
    </unit>
  </file>
</xliff>`;
      const entries: TranslatedEntry[] = [
        { key: 'price', value: 'Price', translation: 'Pay $1 now $& later' },
      ];
      const result = parser.reconstruct(xliff, entries);
      expect(result).toContain('<target>Pay $1 now $&amp; later</target>');
    });
  });
});
