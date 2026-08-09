/** One `<item quantity=…>` of an Android `<plurals>` element. */
export interface PluralItemLike {
  quantity: string;
  value: string;
}

/**
 * The plural form whose translation comes from the entry's own `value` rather
 * than from a separately translated slot.
 *
 * `other` is the form Android requires every `<plurals>` to declare, and it is
 * the one the extractor publishes as `entry.value`; the first item stands in for
 * a non-conforming element that declares no `other`.
 *
 * Chosen by quantity, never by matching `value`: English invariant nouns (fish,
 * sheep, series) and copy-pasted items make two forms carry the same source
 * text, and a value match then returned whichever came first — so the real
 * primary kept its source-language text, which was written to the target and
 * recorded as translated.
 */
export function primaryPluralItem<T extends PluralItemLike>(
  plurals: readonly T[]
): T | undefined {
  return plurals.find((p) => p.quantity === 'other') ?? plurals[0];
}
