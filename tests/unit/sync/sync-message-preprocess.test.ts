import { expandPlurals, detectIcu, writebackPlurals } from '../../../src/sync/sync-message-preprocess';
import type { SyncDiff } from '../../../src/sync/types';
import type { TranslationResult } from '../../../src/api/translation-client';

function makeDiff(partial: Partial<SyncDiff>): SyncDiff {
  return {
    key: 'k',
    status: 'new',
    value: 'v',
    ...partial,
  };
}

describe('expandPlurals', () => {
  it('appends non-primary Android plural quantity values, skipping those equal to diff.value', () => {
    const diff = makeDiff({
      key: 'apples',
      value: '{count, plural, other {# apples}}',
      metadata: {
        plurals: [
          { quantity: 'one', value: '{count, plural, one {# apple}}' },
          { quantity: 'other', value: '{count, plural, other {# apples}}' },
        ],
      },
    });

    const { extendedTexts, pluralSlots } = expandPlurals(
      ['{count, plural, other {# apples}}'],
      [diff],
    );

    expect(extendedTexts).toHaveLength(2);
    expect(extendedTexts[1]).toBe('{count, plural, one {# apple}}');
    expect(pluralSlots).toEqual([
      { diffIndex: 0, format: 'android', slotKey: 'one', textIndex: 1 },
    ]);
  });

  it('appends msgid_plural when it differs from diff.value', () => {
    const diff = makeDiff({
      key: 'item',
      value: 'item',
      metadata: { msgid_plural: 'items', plural_forms: {} },
    });

    const { extendedTexts, pluralSlots } = expandPlurals(['item'], [diff]);

    expect(extendedTexts).toEqual(['item', 'items']);
    expect(pluralSlots).toEqual([
      { diffIndex: 0, format: 'po', slotKey: 'msgid_plural', textIndex: 1 },
    ]);
  });

  it('passes through diffs without plural metadata untouched', () => {
    const diff = makeDiff({ key: 'greeting', value: 'Hello' });

    const { extendedTexts, pluralSlots } = expandPlurals(['Hello'], [diff]);

    expect(extendedTexts).toEqual(['Hello']);
    expect(pluralSlots).toEqual([]);
  });
});

describe('detectIcu', () => {
  it('replaces ICU positions with __ICU_PLACEHOLDER_{ti}__ and preserves positions', () => {
    const input = ['plain text', '{n, plural, one {# item} other {# items}}'];

    const { extendedTexts, icuMappings } = detectIcu(input);

    expect(extendedTexts[0]).toBe('plain text');
    expect(extendedTexts[1]).toBe('__ICU_PLACEHOLDER_1__');
    expect(icuMappings).toHaveLength(1);
    expect(icuMappings[0]!.textIndex).toBe(1);
  });

  it('does not mutate the input array', () => {
    const input = ['{n, plural, one {x} other {y}}'];

    detectIcu(input);

    expect(input[0]).toBe('{n, plural, one {x} other {y}}');
  });
});

describe('writebackPlurals', () => {
  it('writes translated Android plural quantity values back into diff.metadata.plurals', () => {
    const diff = makeDiff({
      key: 'items',
      metadata: {
        plurals: [
          { quantity: 'one', value: '1 item' },
          { quantity: 'other', value: '%d items' },
        ],
      },
    });
    const results: (TranslationResult | null)[] = [
      { text: '%d Artikel', billedCharacters: 10 },
      { text: '1 Artikel', billedCharacters: 9 },
    ];
    const slots = [
      { diffIndex: 0, format: 'android' as const, slotKey: 'one', textIndex: 1 },
    ];

    writebackPlurals(results, slots, [diff]);

    const plurals = diff.metadata!['plurals'] as Array<{ quantity: string; value: string }>;
    expect(plurals.find(p => p.quantity === 'one')!.value).toBe('1 Artikel');
    expect(plurals.find(p => p.quantity === 'other')!.value).toBe('%d items'); // untouched
  });

  it('writes msgstr[1] for PO msgid_plural slots and propagates to higher msgstr[N]', () => {
    const diff = makeDiff({
      key: 'item',
      metadata: {
        msgid_plural: 'items',
        plural_forms: { 'msgstr[0]': '', 'msgstr[1]': '', 'msgstr[2]': '' },
      },
    });
    const results: (TranslationResult | null)[] = [
      { text: 'Artikel', billedCharacters: 7 },
      { text: 'Artikel (pl)', billedCharacters: 12 },
    ];
    const slots = [
      { diffIndex: 0, format: 'po' as const, slotKey: 'msgid_plural', textIndex: 1 },
    ];

    writebackPlurals(results, slots, [diff]);

    const forms = diff.metadata!['plural_forms'] as Record<string, string>;
    expect(forms['msgstr[1]']).toBe('Artikel (pl)');
    expect(forms['msgstr[2]']).toBe('Artikel (pl)');
  });

  it('skips slots whose results are null (failed translations)', () => {
    const diff = makeDiff({
      key: 'items',
      metadata: { plurals: [{ quantity: 'one', value: 'original' }] },
    });
    const results: (TranslationResult | null)[] = [null, null];
    const slots = [
      { diffIndex: 0, format: 'android' as const, slotKey: 'one', textIndex: 1 },
    ];

    writebackPlurals(results, slots, [diff]);

    const plurals = diff.metadata!['plurals'] as Array<{ quantity: string; value: string }>;
    expect(plurals[0]!.value).toBe('original');
  });
});
