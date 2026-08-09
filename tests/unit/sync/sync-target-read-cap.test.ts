import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { readTargetFile } from '../../../src/sync/sync-target-read';
import { JsonFormatParser } from '../../../src/formats/json';

/**
 * Unit tests for the target-file read cap.
 */

describe('oversized target file', () => {
  // `max_file_bytes` was enforced on source files only, so a target — the file a
  // hostile or corrupt checkout actually controls — was parsed and rebuilt at any
  // size. It is refused rather than treated as empty, which is what would
  // otherwise re-translate the locale in full and overwrite the file.
  it('is refused rather than read as empty', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-target-cap-'));
    try {
      const target = path.join(dir, 'de.json');
      fs.writeFileSync(
        target,
        JSON.stringify({ greeting: 'x'.repeat(5000) }),
        'utf-8'
      );

      const read = await readTargetFile(
        new JsonFormatParser(),
        target,
        undefined,
        1024
      );

      expect(read.state).toBe('unusable');
      if (read.state === 'unusable') {
        expect(read.reason).toMatch(/max_file_bytes/);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads a target inside the cap normally', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-target-cap-'));
    try {
      const target = path.join(dir, 'de.json');
      fs.writeFileSync(target, JSON.stringify({ greeting: 'Hallo' }), 'utf-8');

      const read = await readTargetFile(
        new JsonFormatParser(),
        target,
        undefined,
        1024
      );

      expect(read.state).toBe('usable');
      if (read.state === 'usable') {
        expect(read.translations.get('greeting')).toBe('Hallo');
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('applies no cap when none is given', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-target-cap-'));
    try {
      const target = path.join(dir, 'de.json');
      fs.writeFileSync(
        target,
        JSON.stringify({ greeting: 'x'.repeat(5000) }),
        'utf-8'
      );

      const read = await readTargetFile(new JsonFormatParser(), target);
      expect(read.state).toBe('usable');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
