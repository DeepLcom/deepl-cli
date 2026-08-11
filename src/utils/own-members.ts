/**
 * Stores an own, enumerable member. Plain assignment cannot be used: a key named
 * `__proto__` reaches the prototype setter instead of creating a property, so
 * the member never lands in the object it was meant for.
 */
export function setOwnMember<T>(
  map: Record<string, T>,
  key: string,
  value: T
): void {
  Object.defineProperty(map, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Reads a member only when the map actually holds one. Plain indexing hands
 * back inherited `Object.prototype` members for keys named `constructor`,
 * `toString`, `valueOf` and `hasOwnProperty`, which read as an existing member
 * that happens to be missing every field it should have.
 */
export function getOwnMember<T>(
  map: Record<string, T>,
  key: string
): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}
