/**
 * Typed DeepLCLIError subclasses — symmetry checks across the error
 * taxonomy. The classifier tests live in tests/unit/exit-codes.test.ts;
 * this file asserts the class contracts that exit-code dispatch leans on.
 */

import {
  DeepLCLIError,
  SyncConflictError,
  SyncDriftError,
  SyncPartialFailureError,
} from '../../src/utils/errors';
import { ExitCode, exitCodeForError } from '../../src/utils/exit-codes';

describe('SyncConflictError', () => {
  it('carries the SyncConflict exit code (11)', () => {
    const err = new SyncConflictError('boom');
    expect(err.exitCode).toBe(ExitCode.SyncConflict);
    expect(err.exitCode).toBe(11);
  });

  it('is a DeepLCLIError (instanceof)', () => {
    const err = new SyncConflictError('boom');
    expect(err).toBeInstanceOf(DeepLCLIError);
    expect(err).toBeInstanceOf(Error);
  });

  it('name is "SyncConflict" so the JSON envelope stays stable', () => {
    const err = new SyncConflictError('boom');
    expect(err.name).toBe('SyncConflict');
  });

  it('exposes the custom suggestion when provided', () => {
    const err = new SyncConflictError('boom', 'do the thing');
    expect(err.suggestion).toBe('do the thing');
  });

  it('falls back to a default suggestion when none provided', () => {
    const err = new SyncConflictError('boom');
    expect(err.suggestion).toMatch(/conflict markers manually/);
    expect(err.suggestion).toMatch(/deepl sync/);
  });

  it('is classified by exitCodeForError as SyncConflict', () => {
    const err = new SyncConflictError('boom');
    expect(exitCodeForError(err)).toBe(ExitCode.SyncConflict);
  });
});

describe('SyncDriftError (regression guard after taxonomy additions)', () => {
  it('still carries the SyncDrift exit code (10)', () => {
    const err = new SyncDriftError('drift');
    expect(err.exitCode).toBe(ExitCode.SyncDrift);
    expect(err.exitCode).toBe(10);
  });
});

describe('SyncPartialFailureError', () => {
  it('carries the PartialFailure exit code (12)', () => {
    const err = new SyncPartialFailureError('some locales failed');
    expect(err.exitCode).toBe(ExitCode.PartialFailure);
    expect(err.exitCode).toBe(12);
  });

  it('is a DeepLCLIError (instanceof)', () => {
    const err = new SyncPartialFailureError('some locales failed');
    expect(err).toBeInstanceOf(DeepLCLIError);
    expect(err).toBeInstanceOf(Error);
  });

  it('name is "SyncPartialFailure" so the JSON envelope stays stable', () => {
    const err = new SyncPartialFailureError('some locales failed');
    expect(err.name).toBe('SyncPartialFailure');
  });

  it('exposes the custom suggestion when provided', () => {
    const err = new SyncPartialFailureError('some locales failed', 'do the thing');
    expect(err.suggestion).toBe('do the thing');
  });

  it('falls back to a default suggestion that names --locale retry', () => {
    const err = new SyncPartialFailureError('some locales failed');
    expect(err.suggestion).toMatch(/--locale/);
    expect(err.suggestion).toMatch(/deepl sync/);
  });

  it('is classified by exitCodeForError as PartialFailure', () => {
    const err = new SyncPartialFailureError('some locales failed');
    expect(exitCodeForError(err)).toBe(ExitCode.PartialFailure);
  });
});
