/**
 * Tests that XLIFF elements carrying attributes are handled.
 *
 * `state` is a standard XLIFF attribute that every CAT tool writes, so
 * SEGMENT_RE and TARGET_RE have to match a tag carrying attributes and not
 * only a bare `<segment>` / `<target>`. The failures otherwise are severe and
 * silent: for XLIFF 2.0, extract returns no entries and reconstruct then
 * deletes every `<unit>`; for XLIFF 1.2, an existing `<target state="...">`
 * reads as absent and a second `<target>` is injected, producing
 * schema-invalid output that retains the stale translation.
 */

import { XliffFormatParser } from '../../../src/formats/xliff';

const V12_WITH_STATE = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="de" datatype="plaintext" original="app">
    <body>
      <trans-unit id="greeting">
        <source>Hello</source>
        <target state="needs-translation">Hallo alt</target>
      </trans-unit>
    </body>
  </file>
</xliff>
`;

const V20_WITH_STATE = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="2.0" srcLang="en" trgLang="de">
  <file id="f1">
    <unit id="greeting">
      <segment state="initial">
        <source>Hello</source>
        <target>Hallo alt</target>
      </segment>
    </unit>
  </file>
</xliff>
`;

describe('XLIFF elements with attributes', () => {
  describe('XLIFF 2.0 <segment state="...">', () => {
    it('should extract the unit rather than returning nothing', () => {
      const entries = new XliffFormatParser().extract(V20_WITH_STATE);

      expect(entries.map((e) => e.key)).toEqual(['greeting']);
      expect(entries[0]?.value).toBe('Hello');
    });

    it('should not delete the unit on reconstruct', () => {
      const parser = new XliffFormatParser();
      const entries = parser.extract(V20_WITH_STATE);
      const translated = entries.map((e) => ({
        ...e,
        translation: 'Guten Tag',
      }));

      const out = parser.reconstruct(V20_WITH_STATE, translated);

      expect(out).toContain('<unit id="greeting">');
      expect(out).toContain('Guten Tag');
      expect(parser.extract(out).map((e) => e.key)).toEqual(['greeting']);
    });

    it('should say the segment is translated once it holds a new translation', () => {
      const parser = new XliffFormatParser();
      const entries = parser.extract(V20_WITH_STATE);

      const out = parser.reconstruct(
        V20_WITH_STATE,
        entries.map((e) => ({ ...e, translation: 'Guten Tag' }))
      );

      expect(out).toContain('state="translated"');
      expect(out).not.toContain('state="initial"');
    });

    it('should leave the segment state alone when the translation is unchanged', () => {
      const parser = new XliffFormatParser();
      const entries = parser.extract(V20_WITH_STATE);

      const out = parser.reconstruct(
        V20_WITH_STATE,
        entries.map((e) => ({ ...e, translation: 'Hallo alt' }))
      );

      expect(out).toContain('state="initial"');
    });
  });

  describe('XLIFF 1.2 <target state="...">', () => {
    it('should replace the existing target rather than injecting a second one', () => {
      const parser = new XliffFormatParser();
      const entries = parser.extract(V12_WITH_STATE);

      const out = parser.reconstruct(
        V12_WITH_STATE,
        entries.map((e) => ({ ...e, translation: 'Guten Tag' }))
      );

      const targetOpenTags = out.match(/<target[\s>]/g) ?? [];
      expect(targetOpenTags).toHaveLength(1);
      expect(out).toContain('Guten Tag');
      expect(out).not.toContain('Hallo alt');
    });

    it('should say the target is translated once it holds a new translation', () => {
      const parser = new XliffFormatParser();
      const entries = parser.extract(V12_WITH_STATE);

      const out = parser.reconstruct(
        V12_WITH_STATE,
        entries.map((e) => ({ ...e, translation: 'Guten Tag' }))
      );

      expect(out).toContain('<target state="translated">Guten Tag</target>');
      expect(out).not.toContain('needs-translation');
    });

    it('should leave the target state alone when the translation is unchanged', () => {
      const parser = new XliffFormatParser();
      const entries = parser.extract(V12_WITH_STATE);

      const out = parser.reconstruct(
        V12_WITH_STATE,
        entries.map((e) => ({ ...e, translation: 'Hallo alt' }))
      );

      expect(out).toContain('state="needs-translation"');
    });

    it('should replace a signed-off state it has just written over', () => {
      const parser = new XliffFormatParser();
      const signedOff = V12_WITH_STATE.replace(
        'needs-translation',
        'signed-off'
      );
      const entries = parser.extract(signedOff);

      const out = parser.reconstruct(
        signedOff,
        entries.map((e) => ({ ...e, translation: 'Guten Tag' }))
      );

      expect(out).toContain('state="translated"');
      expect(out).not.toContain('signed-off');
    });

    it('should add no state attribute to a target that carries none', () => {
      const parser = new XliffFormatParser();
      const bare = V12_WITH_STATE.replace(' state="needs-translation"', '');
      const entries = parser.extract(bare);

      const out = parser.reconstruct(
        bare,
        entries.map((e) => ({ ...e, translation: 'Guten Tag' }))
      );

      expect(out).toContain('<target>Guten Tag</target>');
      expect(out).not.toContain('state=');
    });

    it('should keep the attributes that are not the state', () => {
      const parser = new XliffFormatParser();
      const withMore = V12_WITH_STATE.replace(
        '<target state="needs-translation">',
        '<target xml:lang="de" state="needs-translation" approved="no">'
      );
      const entries = parser.extract(withMore);

      const out = parser.reconstruct(
        withMore,
        entries.map((e) => ({ ...e, translation: 'Guten Tag' }))
      );

      expect(out).toContain(
        '<target xml:lang="de" state="translated" approved="no">Guten Tag</target>'
      );
    });
  });
});
