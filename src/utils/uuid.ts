import { ValidationError } from './errors.js';

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuid(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new ValidationError('Invalid UUID format');
  }
}

export function validateTranslationMemoryId(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new ValidationError('Invalid translation memory ID format');
  }
}
