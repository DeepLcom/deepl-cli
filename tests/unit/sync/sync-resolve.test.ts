import * as fs from 'fs';
import {
  hasConflictMarkers,
  resolveConflicts,
  resolveLockFile,
} from '../../../src/sync/sync-resolve';
import type { ResolveDecision } from '../../../src/sync/sync-resolve';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: jest.fn(),
      writeFile: jest.fn(),
    },
  };
});

const mockReadFile = fs.promises.readFile as jest.MockedFunction<
  typeof fs.promises.readFile
>;
const mockWriteFile = fs.promises.writeFile as jest.MockedFunction<
  typeof fs.promises.writeFile
>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('hasConflictMarkers()', () => {
  it('should return true when content starts with <<<<<<< marker', () => {
    const content =
      '<<<<<<< HEAD\nsome content\n=======\nother content\n>>>>>>> branch';
    expect(hasConflictMarkers(content)).toBe(true);
  });

  it('should return true for bare <<<<<<< marker', () => {
    expect(hasConflictMarkers('<<<<<<< HEAD')).toBe(true);
  });

  it('should return false for clean content without conflict markers', () => {
    const content = '{"entries": {}, "version": 1}';
    expect(hasConflictMarkers(content)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(hasConflictMarkers('')).toBe(false);
  });

  it('should return false when < characters appear but not seven in a row', () => {
    expect(hasConflictMarkers('<<<<<< not enough')).toBe(false);
  });

  it('should detect conflict markers after a newline', () => {
    const content = 'some preamble\n<<<<<<< HEAD\nconflict';
    expect(hasConflictMarkers(content)).toBe(true);
  });

  it('should return true when eight or more < characters start the string', () => {
    expect(hasConflictMarkers('<<<<<<<<<<<<< something')).toBe(true);
  });
});

describe('resolveConflicts()', () => {
  describe('JSON fragment merging with translated_at timestamps', () => {
    it('should take the side with a newer translated_at timestamp', () => {
      const content = [
        '{',
        '<<<<<<< HEAD',
        '  "greeting": { "source_hash": "abc123", "translated_at": "2025-01-01T00:00:00Z" }',
        '=======',
        '  "greeting": { "source_hash": "abc123", "translated_at": "2025-06-15T00:00:00Z" }',
        '>>>>>>> branch',
        '}',
      ].join('\n');

      const { resolved, mergeCount } = resolveConflicts(content);
      expect(mergeCount).toBe(1);
      const parsed = JSON.parse(resolved);
      expect(parsed.greeting.translated_at).toBe('2025-06-15T00:00:00Z');
    });

    it('should take the ours side when timestamps are equal', () => {
      const content = [
        '{',
        '<<<<<<< HEAD',
        '  "key": { "source_hash": "aaa", "translated_at": "2025-03-01T00:00:00Z" }',
        '=======',
        '  "key": { "source_hash": "bbb", "translated_at": "2025-03-01T00:00:00Z" }',
        '>>>>>>> branch',
        '}',
      ].join('\n');

      const { resolved } = resolveConflicts(content);
      const parsed = JSON.parse(resolved);
      expect(parsed.key.source_hash).toBe('aaa');
    });

    it('should merge keys present only on one side', () => {
      const content = [
        '{',
        '<<<<<<< HEAD',
        '  "alpha": { "source_hash": "a1", "translated_at": "2025-01-01T00:00:00Z" }',
        '=======',
        '  "beta": { "source_hash": "b1", "translated_at": "2025-02-01T00:00:00Z" }',
        '>>>>>>> branch',
        '}',
      ].join('\n');

      const { resolved } = resolveConflicts(content);
      const parsed = JSON.parse(resolved);
      expect(parsed.alpha).toBeDefined();
      expect(parsed.beta).toBeDefined();
    });

    it('should prefer theirs when only theirs has translated_at', () => {
      const content = [
        '{',
        '<<<<<<< HEAD',
        '  "item": { "source_hash": "h1" }',
        '=======',
        '  "item": { "source_hash": "h2", "translated_at": "2025-04-01T00:00:00Z" }',
        '>>>>>>> branch',
        '}',
      ].join('\n');

      const { resolved } = resolveConflicts(content);
      const parsed = JSON.parse(resolved);
      expect(parsed.item.translated_at).toBe('2025-04-01T00:00:00Z');
    });
  });

  // The fixtures above put translated_at directly on the entry. SyncLockManager
  // does not write that shape: the entry carries source_hash and a translations
  // map, and translated_at sits on each locale inside it. These drive the shape
  // that reaches the resolver after a real `git merge`.
  describe('the lockfile shape SyncLockManager writes', () => {
    function conflictedLock(ourStamp: string, theirStamp: string): string {
      const entry = (hash: string, stamp: string): string =>
        `      "greeting": { "source_hash": "185f8db32271", "source_locale": "en", "updated_at": "2026-01-01T00:00:00.000Z", "translations": { "de": { "locale": "de", "hash": "${hash}", "translated_at": "${stamp}" } } }`;
      return [
        '{',
        '  "version": 1,',
        '  "entries": {',
        '    "locales/en.json": {',
        '<<<<<<< HEAD',
        entry('ours_hash', ourStamp),
        '=======',
        entry('them_hash', theirStamp),
        '>>>>>>> feature/de-updates',
        '    }',
        '  }',
        '}',
      ].join('\n');
    }

    function survivingHash(resolved: string): string {
      const parsed = JSON.parse(resolved) as {
        entries: Record<
          string,
          Record<string, { translations: Record<string, { hash: string }> }>
        >;
      };
      return parsed.entries['locales/en.json']!['greeting']!.translations['de']!
        .hash;
    }

    it('should take theirs when their nested translation is newer', () => {
      const { resolved, decisions } = resolveConflicts(
        conflictedLock('2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z')
      );

      expect(survivingHash(resolved)).toBe('them_hash');
      expect(
        decisions.some(
          (d) => d.source === 'theirs' && /newer translated_at/.test(d.reason)
        )
      ).toBe(true);
    });

    it('should keep ours when our nested translation is newer', () => {
      const { resolved, decisions } = resolveConflicts(
        conflictedLock('2026-03-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z')
      );

      expect(survivingHash(resolved)).toBe('ours_hash');
      expect(
        decisions.some(
          (d) => d.source === 'ours' && /newer translated_at/.test(d.reason)
        )
      ).toBe(true);
    });

    it('should never report that neither side had a timestamp', () => {
      const { decisions } = resolveConflicts(
        conflictedLock('2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z')
      );

      expect(
        decisions.filter((d) => /neither side had translated_at/.test(d.reason))
      ).toHaveLength(0);
    });

    it('should not report fields the two sides agree on as conflicts', () => {
      const { decisions } = resolveConflicts(
        conflictedLock('2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z')
      );

      // source_hash, source_locale and updated_at are identical on both sides.
      expect(
        decisions.filter((d) => /scalar conflict/.test(d.reason))
      ).toHaveLength(0);
    });

    it('should report one decision, against the nested locale key', () => {
      const { decisions } = resolveConflicts(
        conflictedLock('2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z')
      );

      // The merge runs on the conflict fragment, so the path is relative to it
      // rather than to the whole lockfile. One entry, because the fields the
      // sides agree on are not reported.
      expect(decisions.map((d) => d.key)).toEqual(['greeting.translations.de']);
    });
  });

  // The lockfile puts each translation on one line, so the smallest region git
  // can produce is a whole `"<locale>": {...}` pair. Unless that pair is the
  // last in its map it carries a trailing comma, which is the shape the resolver
  // actually has to read.
  describe("git's conflict shape for a one-line-per-translation lockfile", () => {
    function conflictedLock(
      ours: string,
      theirs: string,
      trailing: ',' | '' = ','
    ): string {
      return [
        '{',
        '  "version": 1,',
        '  "entries": {',
        '    "locales/en.json": {',
        '      "greeting": {',
        '        "source_hash": "185f8db32271",',
        '        "source_text": "Hello",',
        '        "translations": {',
        '<<<<<<< HEAD',
        `          "de": ${ours}${trailing}`,
        '=======',
        `          "de": ${theirs}${trailing}`,
        '>>>>>>> feature/de-updates',
        trailing === ','
          ? '          "fr": {"hash": "fr_hash", "status": "translated", "translated_at": "2026-01-01T00:00:00.000Z"}'
          : '',
        '        }',
        '      }',
        '    }',
        '  }',
        '}',
      ]
        .filter((line) => line !== '')
        .join('\n');
    }

    function translation(
      hash: string,
      stamp: string,
      review = 'machine_translated'
    ): string {
      return `{"hash": "${hash}", "review_status": "${review}", "status": "translated", "translated_at": "${stamp}"}`;
    }

    function surviving(resolved: string): Record<string, unknown> {
      const parsed = JSON.parse(resolved) as {
        entries: Record<
          string,
          Record<
            string,
            { translations: Record<string, Record<string, unknown>> }
          >
        >;
      };
      return parsed.entries['locales/en.json']!['greeting']!.translations[
        'de'
      ]!;
    }

    it('should take theirs on the newer translated_at despite the trailing comma', () => {
      const { resolved, decisions } = resolveConflicts(
        conflictedLock(
          translation('ours_hash', '2026-02-01T00:00:00.000Z'),
          translation('them_hash', '2026-03-01T00:00:00.000Z')
        )
      );

      expect(surviving(resolved)['hash']).toBe('them_hash');
      expect(
        decisions.some(
          (d) => d.source === 'theirs' && /newer translated_at/.test(d.reason)
        )
      ).toBe(true);
    });

    it('should not fall back to the length heuristic for that shape', () => {
      const { decisions } = resolveConflicts(
        conflictedLock(
          translation('ours_hash', '2026-02-01T00:00:00.000Z'),
          translation('them_hash', '2026-03-01T00:00:00.000Z')
        )
      );

      expect(decisions.filter((d) => d.source === 'length-heuristic')).toEqual(
        []
      );
      expect(decisions.map((d) => d.key)).toEqual(['de']);
    });

    it('should leave the locale that followed the conflict intact', () => {
      const { resolved } = resolveConflicts(
        conflictedLock(
          translation('ours_hash', '2026-02-01T00:00:00.000Z'),
          translation('them_hash', '2026-03-01T00:00:00.000Z')
        )
      );

      const parsed = JSON.parse(resolved) as {
        entries: Record<
          string,
          Record<string, { translations: Record<string, { hash: string }> }>
        >;
      };
      expect(
        parsed.entries['locales/en.json']!['greeting']!.translations['fr']!.hash
      ).toBe('fr_hash');
    });

    it('should resolve the shape without a trailing comma too', () => {
      const { resolved, decisions } = resolveConflicts(
        conflictedLock(
          translation('ours_hash', '2026-02-01T00:00:00.000Z'),
          translation('them_hash', '2026-03-01T00:00:00.000Z'),
          ''
        )
      );

      expect(surviving(resolved)['hash']).toBe('them_hash');
      expect(decisions.filter((d) => d.source === 'length-heuristic')).toEqual(
        []
      );
    });

    // The failure this format exists to prevent: never emit a translation whose
    // fields come from both sides.
    it('should keep one whole side when the timestamps are equal', () => {
      const stamp = '2026-01-01T00:00:00.000Z';
      const { resolved } = resolveConflicts(
        conflictedLock(
          translation('machine_hash', stamp, 'machine_translated'),
          translation('human_hash', stamp, 'human_reviewed')
        )
      );

      const winner = surviving(resolved);
      expect([
        { hash: 'machine_hash', review: 'machine_translated' },
        { hash: 'human_hash', review: 'human_reviewed' },
      ]).toContainEqual({
        hash: winner['hash'],
        review: winner['review_status'],
      });
    });
  });

  describe('sides that disagree on the region terminator', () => {
    // The member following a region is context shared by both sides, so a region
    // that is a member list carries the same terminator on both. Disagreement
    // means one side deleted what the other kept, and inventing a terminator
    // there can only produce invalid JSON.
    function deleteVersusModify(): string {
      return [
        '{',
        '  "entries": {',
        '    "locales/en.json": {',
        '<<<<<<< HEAD',
        '=======',
        '      "greeting": {"source_hash": "src2", "translations": {}},',
        '>>>>>>> feature/other',
        '      "farewell": {"source_hash": "src3", "translations": {}}',
        '    }',
        '  }',
        '}',
      ].join('\n');
    }

    it('should fall back rather than guess a terminator', () => {
      const { decisions } = resolveConflicts(deleteVersusModify());

      expect(decisions).toHaveLength(1);
      expect(decisions[0]!.source).toBe('length-heuristic');
      expect(decisions[0]!.reason).toMatch(/ends a member list/);
    });

    it('should still leave the document parseable', () => {
      const { resolved } = resolveConflicts(deleteVersusModify());

      const parsed = JSON.parse(resolved) as {
        entries: Record<string, Record<string, unknown>>;
      };
      expect(Object.keys(parsed.entries['locales/en.json']!).sort()).toEqual([
        'farewell',
        'greeting',
      ]);
    });
  });

  describe('fallback to longer side when JSON does not parse', () => {
    it('should pick the longer side when neither side is valid JSON', () => {
      const content = [
        'before',
        '<<<<<<< HEAD',
        'short',
        '=======',
        'this is the longer text that should win',
        '>>>>>>> branch',
        'after',
      ].join('\n');

      const { resolved, mergeCount } = resolveConflicts(content);
      expect(mergeCount).toBe(1);
      expect(resolved).toContain('this is the longer text that should win');
      expect(resolved).not.toContain('short\n');
    });

    it('should pick ours when both sides have equal length', () => {
      const content = [
        '<<<<<<< HEAD',
        'aaa',
        '=======',
        'bbb',
        '>>>>>>> branch',
      ].join('\n');

      const { resolved } = resolveConflicts(content);
      expect(resolved).toContain('aaa');
    });

    it('should pick ours when ours is longer', () => {
      const content = [
        '<<<<<<< HEAD',
        'this is the longer ours side text',
        '=======',
        'short',
        '>>>>>>> branch',
      ].join('\n');

      const { resolved } = resolveConflicts(content);
      expect(resolved).toContain('this is the longer ours side text');
    });
  });

  describe('multiple conflict blocks', () => {
    it('should resolve all conflict blocks independently', () => {
      const content = [
        '{',
        '<<<<<<< HEAD',
        '  "first": { "source_hash": "f1", "translated_at": "2025-01-01T00:00:00Z" }',
        '=======',
        '  "first": { "source_hash": "f1", "translated_at": "2025-06-01T00:00:00Z" }',
        '>>>>>>> branch',
        ',',
        '<<<<<<< HEAD',
        '  "second": { "source_hash": "s1", "translated_at": "2025-08-01T00:00:00Z" }',
        '=======',
        '  "second": { "source_hash": "s1", "translated_at": "2025-03-01T00:00:00Z" }',
        '>>>>>>> branch',
        '}',
      ].join('\n');

      const { resolved, mergeCount } = resolveConflicts(content);
      expect(mergeCount).toBe(2);
      const parsed = JSON.parse(resolved);
      expect(parsed.first.translated_at).toBe('2025-06-01T00:00:00Z');
      expect(parsed.second.translated_at).toBe('2025-08-01T00:00:00Z');
    });

    it('should report correct mergeCount for three blocks', () => {
      const content = [
        '<<<<<<< HEAD',
        'a',
        '=======',
        'b',
        '>>>>>>> branch',
        '<<<<<<< HEAD',
        'c',
        '=======',
        'd',
        '>>>>>>> branch',
        '<<<<<<< HEAD',
        'e',
        '=======',
        'f',
        '>>>>>>> branch',
      ].join('\n');

      const { mergeCount } = resolveConflicts(content);
      expect(mergeCount).toBe(3);
    });
  });

  describe('content without conflicts', () => {
    it('should return content unchanged with mergeCount 0', () => {
      const content = '{"entries": {}, "version": 1}';
      const { resolved, mergeCount } = resolveConflicts(content);
      expect(resolved).toBe(content);
      expect(mergeCount).toBe(0);
    });
  });
});

describe('resolveLockFile()', () => {
  const lockPath = '/tmp/test-sync/.deepl-sync.lock.json';

  it('should read file with conflicts, resolve, and write back', async () => {
    // Both sides are complete JSON; the longer side wins via fallback
    const conflictContent = [
      '<<<<<<< HEAD',
      '{"greeting": {"source_hash": "abc", "translated_at": "2025-01-01T00:00:00Z"}}',
      '=======',
      '{"greeting": {"source_hash": "abc", "translated_at": "2025-06-01T00:00:00Z"}, "extra": true}',
      '>>>>>>> branch',
    ].join('\n');

    mockReadFile.mockResolvedValue(conflictContent);
    mockWriteFile.mockResolvedValue(undefined);

    const result = await resolveLockFile(lockPath);

    expect(result.hadConflicts).toBe(true);
    expect(result.resolved).toBe(true);
    expect(result.entriesMerged).toBe(1);

    expect(mockReadFile).toHaveBeenCalledWith(lockPath, 'utf-8');
    expect(mockWriteFile).toHaveBeenCalledWith(
      lockPath,
      expect.any(String),
      'utf-8'
    );

    const writtenContent = mockWriteFile.mock.calls[0]![1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.greeting.translated_at).toBe('2025-06-01T00:00:00Z');
    expect(parsed.extra).toBe(true);
  });

  // Resolving rebuilds the fragment with its own indentation, so without writing
  // the canonical form back the file would leave the resolver's own output in a
  // shape the next merge can field-mix again.
  it('should write the resolved lock file back in canonical form', async () => {
    const translation = (hash: string, stamp: string): string =>
      `{"hash": "${hash}", "status": "translated", "translated_at": "${stamp}"}`;
    mockReadFile.mockResolvedValue(
      [
        '{',
        '  "version": 1,',
        '  "entries": {',
        '    "locales/en.json": {',
        '      "greeting": {',
        '        "source_hash": "185f8db32271",',
        '        "source_text": "Hello",',
        '        "translations": {',
        '<<<<<<< HEAD',
        `          "de": ${translation('ours_hash', '2026-02-01T00:00:00.000Z')},`,
        '=======',
        `          "de": ${translation('them_hash', '2026-03-01T00:00:00.000Z')},`,
        '>>>>>>> branch',
        `          "fr": ${translation('fr_hash', '2026-01-01T00:00:00.000Z')}`,
        '        }',
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n')
    );
    mockWriteFile.mockResolvedValue(undefined);

    const result = await resolveLockFile(lockPath);

    expect(result.resolved).toBe(true);
    const written = mockWriteFile.mock.calls[0]![1] as string;
    const localeLines = written
      .split('\n')
      .filter((line) => /^\s*"(de|fr)":/.test(line));
    expect(localeLines).toHaveLength(2);
    for (const line of localeLines) {
      expect(line.trimEnd().replace(/,$/, '')).toMatch(/\}$/);
    }
    const parsed = JSON.parse(written) as {
      entries: Record<
        string,
        Record<string, { translations: Record<string, { hash: string }> }>
      >;
    };
    const translations =
      parsed.entries['locales/en.json']!['greeting']!.translations;
    expect(translations['de']!.hash).toBe('them_hash');
    expect(translations['fr']!.hash).toBe('fr_hash');
  });

  it('should return hadConflicts=false for a clean file', async () => {
    const cleanContent = JSON.stringify({ entries: {}, version: 1 });
    mockReadFile.mockResolvedValue(cleanContent);

    const result = await resolveLockFile(lockPath);

    expect(result.hadConflicts).toBe(false);
    expect(result.resolved).toBe(false);
    expect(result.entriesMerged).toBe(0);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('should return resolved=false when resolved content is not valid JSON', async () => {
    // Starts with <<<<<<< so hasConflictMarkers returns true,
    // but the resolved content won't be valid JSON
    const badConflict = [
      '<<<<<<< HEAD',
      'invalid ours',
      '=======',
      'invalid theirs that is longer',
      '>>>>>>> branch',
    ].join('\n');

    mockReadFile.mockResolvedValue(badConflict);

    const result = await resolveLockFile(lockPath);

    expect(result.hadConflicts).toBe(true);
    expect(result.resolved).toBe(false);
    expect(result.entriesMerged).toBe(0);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('should return hadConflicts=false when file cannot be read', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const result = await resolveLockFile(lockPath);

    expect(result.hadConflicts).toBe(false);
    expect(result.resolved).toBe(false);
    expect(result.entriesMerged).toBe(0);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('should handle conflict where theirs side is longer and chosen via fallback', async () => {
    // When both sides have outer braces, fragment parsing fails and
    // the longer side is selected. The theirs side has an extra key making it longer.
    const content = [
      '<<<<<<< HEAD',
      '{"version": 1}',
      '=======',
      '{"version": 1, "source_locale": "en"}',
      '>>>>>>> branch',
    ].join('\n');

    mockReadFile.mockResolvedValue(content);
    mockWriteFile.mockResolvedValue(undefined);

    const result = await resolveLockFile(lockPath);

    expect(result.hadConflicts).toBe(true);
    expect(result.resolved).toBe(true);
    expect(result.entriesMerged).toBe(1);

    const writtenContent = mockWriteFile.mock.calls[0]![1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.source_locale).toBe('en');
    expect(parsed.version).toBe(1);
  });
});

describe('per-entry decision report', () => {
  it('resolveConflicts returns per-key decisions with source and reason', () => {
    const content = [
      '{',
      '<<<<<<< HEAD',
      '  "kept_ours": { "source_hash": "h1", "translated_at": "2026-04-20T09:33:15Z" },',
      '  "kept_theirs": { "source_hash": "h2", "translated_at": "2026-01-01T00:00:00Z" }',
      '=======',
      '  "kept_ours": { "source_hash": "h1", "translated_at": "2026-04-19T00:00:00Z" },',
      '  "kept_theirs": { "source_hash": "h2", "translated_at": "2026-04-20T08:12:03Z" }',
      '>>>>>>> branch',
      '}',
    ].join('\n');

    const { decisions } = resolveConflicts(content);
    expect(Array.isArray(decisions)).toBe(true);

    const byKey = new Map<string, ResolveDecision>(
      decisions.map((d) => [d.key, d])
    );

    const ours = byKey.get('kept_ours');
    expect(ours).toBeDefined();
    expect(ours!.source).toBe('ours');
    expect(ours!.reason).toContain('2026-04-20T09:33:15Z');

    const theirs = byKey.get('kept_theirs');
    expect(theirs).toBeDefined();
    expect(theirs!.source).toBe('theirs');
    expect(theirs!.reason).toContain('2026-04-20T08:12:03Z');
  });

  it('tags a decision as length-heuristic when JSON.parse fails without logging itself', () => {
    // The command layer prints the warning once from the decision; the
    // library must stay silent so it is not printed twice.
    const warnSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const content = [
        'prefix line',
        '<<<<<<< HEAD',
        '{"t"',
        '=======',
        '{"this side is visibly longer and therefore wins"}',
        '>>>>>>> branch',
        'suffix line',
      ].join('\n');

      const { decisions } = resolveConflicts(content, {
        file: 'locales/de/app.json',
      });

      const fallback = decisions.find((d) => d.source === 'length-heuristic');
      expect(fallback).toBeDefined();
      expect(fallback!.file).toBe('locales/de/app.json');
      expect(typeof fallback!.reason).toBe('string');
      expect(fallback!.reason.length).toBeGreaterThan(0);

      const warned = warnSpy.mock.calls.some((args) => {
        const joined = args
          .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
          .join(' ');
        return /parse-error fallback/i.test(joined);
      });
      expect(warned).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('resolveLockFile returns decisions in its result', async () => {
    const content = [
      '{',
      '<<<<<<< HEAD',
      '  "key_a": { "source_hash": "a", "translated_at": "2026-04-20T10:00:00Z" }',
      '=======',
      '  "key_a": { "source_hash": "a", "translated_at": "2026-04-19T10:00:00Z" }',
      '>>>>>>> branch',
      '}',
    ].join('\n');
    mockReadFile.mockResolvedValue(content);
    mockWriteFile.mockResolvedValue(undefined);

    const result = await resolveLockFile('/tmp/test-sync/.deepl-sync.lock');
    expect(result.decisions).toBeDefined();
    expect(result.decisions!.length).toBeGreaterThan(0);
    const keyA = result.decisions!.find((d) => d.key === 'key_a');
    expect(keyA).toBeDefined();
    expect(keyA!.source).toBe('ours');
  });

  it('resolveLockFile in dry-run mode does not write the file', async () => {
    const content = [
      '{',
      '<<<<<<< HEAD',
      '  "x": { "source_hash": "h", "translated_at": "2026-04-20T10:00:00Z" }',
      '=======',
      '  "x": { "source_hash": "h", "translated_at": "2026-04-19T00:00:00Z" }',
      '>>>>>>> branch',
      '}',
    ].join('\n');
    mockReadFile.mockResolvedValue(content);
    mockWriteFile.mockResolvedValue(undefined);

    const result = await resolveLockFile('/tmp/test-sync/.deepl-sync.lock', {
      dryRun: true,
    });
    expect(result.hadConflicts).toBe(true);
    expect(result.resolved).toBe(true);
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(result.decisions).toBeDefined();
    expect(result.decisions!.length).toBeGreaterThan(0);
  });
});

describe('prototype pollution hardening', () => {
  afterEach(() => {
    // Canary: trip loud on any future cross-talk that leaks through the merge helpers.
    /* eslint-disable jest/no-standalone-expect */
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(
      (Object.prototype as unknown as Record<string, unknown>)['polluted']
    ).toBeUndefined();
    /* eslint-enable jest/no-standalone-expect */
    // Remove the key so a leak in one test cannot poison later ones.
    delete (Object.prototype as unknown as Record<string, unknown>)['polluted'];
  });

  it('should not pollute Object.prototype via __proto__ key in conflict fragment', () => {
    const content = [
      '{',
      '<<<<<<< HEAD',
      '  "safe": { "source_hash": "a", "translated_at": "2026-04-20T00:00:00Z" }',
      '=======',
      '  "__proto__": { "polluted": true }',
      '>>>>>>> branch',
      '}',
    ].join('\n');

    resolveConflicts(content);

    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(
      (Object.prototype as unknown as Record<string, unknown>)['polluted']
    ).toBeUndefined();
  });

  it('should not pollute Object.prototype via constructor.prototype in conflict fragment', () => {
    const content = [
      '{',
      '<<<<<<< HEAD',
      '  "safe": { "source_hash": "a", "translated_at": "2026-04-20T00:00:00Z" }',
      '=======',
      '  "constructor": { "prototype": { "polluted": true } }',
      '>>>>>>> branch',
      '}',
    ].join('\n');

    resolveConflicts(content);

    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(
      (Object.prototype as unknown as Record<string, unknown>)['polluted']
    ).toBeUndefined();
  });

  it('should not pollute Object.prototype when __proto__ appears on the ours side', () => {
    const content = [
      '{',
      '<<<<<<< HEAD',
      '  "__proto__": { "polluted": true }',
      '=======',
      '  "safe": { "source_hash": "a", "translated_at": "2026-04-20T00:00:00Z" }',
      '>>>>>>> branch',
      '}',
    ].join('\n');

    resolveConflicts(content);

    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(
      (Object.prototype as unknown as Record<string, unknown>)['polluted']
    ).toBeUndefined();
  });

  it('should not pollute Object.prototype via prototype key in conflict fragment', () => {
    const content = [
      '{',
      '<<<<<<< HEAD',
      '  "safe": { "source_hash": "a", "translated_at": "2026-04-20T00:00:00Z" }',
      '=======',
      '  "prototype": { "polluted": true }',
      '>>>>>>> branch',
      '}',
    ].join('\n');

    resolveConflicts(content);

    expect(
      (Object.prototype as unknown as Record<string, unknown>)['polluted']
    ).toBeUndefined();
  });

  it('should drop __proto__/constructor/prototype keys entirely from merged output', () => {
    const content = [
      '{',
      '<<<<<<< HEAD',
      '  "safe": { "source_hash": "a", "translated_at": "2026-04-20T00:00:00Z" }',
      '=======',
      '  "__proto__": { "polluted": true },',
      '  "constructor": { "polluted": true },',
      '  "prototype": { "polluted": true },',
      '  "legit": { "source_hash": "b", "translated_at": "2026-04-20T00:00:00Z" }',
      '>>>>>>> branch',
      '}',
    ].join('\n');

    const { resolved } = resolveConflicts(content);
    const parsed = JSON.parse(resolved);

    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(
      false
    );
    expect(Object.prototype.hasOwnProperty.call(parsed, 'constructor')).toBe(
      false
    );
    expect(Object.prototype.hasOwnProperty.call(parsed, 'prototype')).toBe(
      false
    );
    expect(parsed.legit).toBeDefined();
    expect(parsed.safe).toBeDefined();
  });
});
