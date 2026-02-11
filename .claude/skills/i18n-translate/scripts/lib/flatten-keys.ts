import type { KeyPath, StringEntry } from './types.js';

export function flattenStrings(data: unknown, prefix: KeyPath = []): StringEntry[] {
  const results: StringEntry[] = [];

  if (data === null || data === undefined) return results;

  if (typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const currentPath = [...prefix, key];
      if (typeof value === 'string') {
        results.push({
          path: currentPath,
          dotPath: pathToDisplayString(currentPath),
          value,
        });
      } else if (typeof value === 'object' && value !== null) {
        results.push(...flattenStrings(value, currentPath));
      }
      // Skip non-string scalars (numbers, booleans) — they're not translatable
    }
  } else if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const currentPath = [...prefix, i];
      const value = data[i];
      if (typeof value === 'string') {
        results.push({
          path: currentPath,
          dotPath: pathToDisplayString(currentPath),
          value,
        });
      } else if (typeof value === 'object' && value !== null) {
        results.push(...flattenStrings(value, currentPath));
      }
    }
  }

  return results;
}

export function flattenAll(data: unknown, prefix: KeyPath = []): { path: KeyPath; value: unknown }[] {
  const results: { path: KeyPath; value: unknown }[] = [];

  if (data === null || data === undefined) return results;

  if (typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const currentPath = [...prefix, key];
      if (typeof value === 'object' && value !== null) {
        results.push(...flattenAll(value, currentPath));
      } else {
        results.push({ path: currentPath, value });
      }
    }
  } else if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const currentPath = [...prefix, i];
      const value = data[i];
      if (typeof value === 'object' && value !== null) {
        results.push(...flattenAll(value, currentPath));
      } else {
        results.push({ path: currentPath, value });
      }
    }
  }

  return results;
}

export function getByPath(data: unknown, path: KeyPath): unknown {
  let current: unknown = data;
  for (const segment of path) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    if (Array.isArray(current)) {
      if (typeof segment !== 'number') return undefined;
      current = current[segment];
    } else {
      current = (current as Record<string, unknown>)[String(segment)];
    }
  }
  return current;
}

export function setByPath(data: Record<string, unknown>, path: KeyPath, value: unknown): void {
  if (path.length === 0) return;

  let current: unknown = data;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]!;
    const nextSegment = path[i + 1]!;

    if (Array.isArray(current)) {
      if (typeof segment !== 'number') return;
      if (current[segment] === undefined || current[segment] === null || typeof current[segment] !== 'object') {
        current[segment] = typeof nextSegment === 'number' ? [] : {};
      }
      current = current[segment];
    } else if (typeof current === 'object' && current !== null) {
      const obj = current as Record<string, unknown>;
      const key = String(segment);
      if (obj[key] === undefined || obj[key] === null || typeof obj[key] !== 'object') {
        obj[key] = typeof nextSegment === 'number' ? [] : {};
      }
      current = obj[key];
    }
  }

  const lastSegment = path[path.length - 1]!;
  if (Array.isArray(current)) {
    if (typeof lastSegment === 'number') {
      current[lastSegment] = value;
    }
  } else if (typeof current === 'object' && current !== null) {
    (current as Record<string, unknown>)[String(lastSegment)] = value;
  }
}

export function pathToDisplayString(path: KeyPath): string {
  if (path.length === 0) return '';

  let result = '';
  for (let i = 0; i < path.length; i++) {
    const segment = path[i]!;
    if (typeof segment === 'number') {
      result += `[${segment}]`;
    } else if (segment.includes('.') || segment.includes('[') || segment.includes(']')) {
      if (i === 0) {
        result += `["${segment}"]`;
      } else {
        result += `["${segment}"]`;
      }
    } else {
      if (i === 0) {
        result += segment;
      } else {
        result += `.${segment}`;
      }
    }
  }
  return result;
}

export function pathsEqual(a: KeyPath, b: KeyPath): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function pathKey(path: KeyPath): string {
  return JSON.stringify(path);
}

export function pathSetDiff(a: KeyPath[], b: KeyPath[]): KeyPath[] {
  const bSet = new Set(b.map(pathKey));
  return a.filter(p => !bSet.has(pathKey(p)));
}
