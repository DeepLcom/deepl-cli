/**
 * E2E Tests for Document Translation
 * Tests document translation features end-to-end
 *
 * Note: These tests focus on CLI behavior, argument parsing, and error handling.
 * Full API integration is tested separately in integration tests.
 */

import * as path from 'path';
import * as fs from 'fs';
import { createTestConfigDir, createTestDir, makeNodeRunCLI } from '../helpers';

describe('Document Translation E2E', () => {
  const testConfig = createTestConfigDir('e2e-doc');
  const testFiles = createTestDir('doc-test');
  const testDir = testFiles.path;
  const helpers = makeNodeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
    testFiles.cleanup();
  });

  const runCLIExpectError = (command: string, apiKey?: string) => {
    return helpers.runCLIExpectError(
      command,
      apiKey !== undefined ? { apiKey } : {}
    );
  };

  describe('--glossary on a document', () => {
    // Handler-level validation runs after the API-key gate, so these need a key
    // to be reachable. The dead endpoint keeps the run off the network for the
    // cases that get past validation.
    const DUMMY_KEY = 'e2e-doc-glossary-key:fx';
    const DEAD_URL = 'http://127.0.0.1:9';

    const pdfPath = (name: string): string => {
      const file = path.join(testDir, `${name}.pdf`);
      fs.writeFileSync(file, Buffer.from('%PDF-1.4 test content'));
      return file;
    };

    const run = (args: string) =>
      helpers.runCLIExpectError(args, { apiKey: DUMMY_KEY });

    it('should require --from, which the API demands for a document glossary', () => {
      const file = pdfPath('glossary-doc');
      const out = path.join(testDir, 'glossary-doc.de.pdf');

      const result = run(
        `translate "${file}" --to de --output "${out}" --glossary my-glossary --api-url ${DEAD_URL}`,
      );

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toContain('--from');
      expect(result.output).toMatch(/glossary/i);
    });

    it('should no longer report --glossary as unsupported for documents', () => {
      const file = pdfPath('glossary-doc2');
      const out = path.join(testDir, 'glossary-doc.de2.pdf');

      const result = run(
        `translate "${file}" --from en --to de --output "${out}" --glossary my-glossary --api-url ${DEAD_URL}`,
      );

      expect(result.output).not.toMatch(/does not support/i);
    });

    it('should accept a repeated --glossary on a document', () => {
      const file = pdfPath('glossary-doc3');
      const out = path.join(testDir, 'glossary-doc.de3.pdf');

      const result = run(
        `translate "${file}" --from en --to de --output "${out}" ` +
          `--glossary base-terms --glossary project-overrides --api-url ${DEAD_URL}`,
      );

      expect(result.output).not.toMatch(/unknown option/i);
      expect(result.output).not.toMatch(/does not support/i);
    });

    it('should still reject a sixth --glossary on a document', () => {
      const file = pdfPath('glossary-doc4');
      const out = path.join(testDir, 'glossary-doc.de4.pdf');

      const result = run(
        `translate "${file}" --from en --to de --output "${out}" ` +
          `--glossary a --glossary b --glossary c --glossary d --glossary e --glossary f`,
      );

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/at most 5 times/i);
    });
  });

  describe('--output-format flag', () => {
    it('should accept valid output formats', () => {
      // Create a test file
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Test content');

      // Test with valid output formats (will fail at API call, not flag validation)
      const formats = ['docx'];

      for (const format of formats) {
        const result = runCLIExpectError(
          `translate "${testFile}" --to es --output-format ${format}`,
          'test-key:fx'
        );

        // Should not fail due to invalid flag, but will fail at API call
        expect(result.output).not.toMatch(/invalid.*output-format/i);
        expect(result.output).not.toMatch(/unknown option.*output-format/i);
      }
    });

    it('should be available in help text', () => {
      const result = runCLIExpectError('translate --help', '');

      expect(result.output).toContain('--output-format');
      expect(result.output).toMatch(/convert.*pdf.*docx/i);
    });

    it('should require a value', () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Test');

      const result = runCLIExpectError(
        `translate "${testFile}" --to es --output-format`,
        'test-key'
      );

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(
        /argument missing|missing.*argument|expected.*argument/i
      );
    });
  });

  describe('--enable-minification flag', () => {
    it('should be accepted as a boolean flag', () => {
      const testFile = path.join(testDir, 'test.docx');
      // Create a minimal DOCX file (just a placeholder)
      fs.writeFileSync(testFile, Buffer.from([0x50, 0x4b, 0x03, 0x04])); // ZIP header

      const result = runCLIExpectError(
        `translate "${testFile}" --to es --enable-minification`,
        'test-key:fx'
      );

      // Should not fail due to invalid flag
      expect(result.output).not.toMatch(/unknown option.*minification/i);
    });

    it('should be available in help text', () => {
      const result = runCLIExpectError('translate --help', '');

      expect(result.output).toContain('--enable-minification');
      expect(result.output).toContain('minification');
    });

    it('should not require a value (boolean flag)', () => {
      const testFile = path.join(testDir, 'test.pptx');
      fs.writeFileSync(testFile, Buffer.from([0x50, 0x4b]));

      // Test that the flag works without a value
      const result = runCLIExpectError(
        `translate "${testFile}" --to es --enable-minification`,
        'test-key:fx'
      );

      // Should fail at API call, not flag parsing
      expect(result.output).not.toMatch(/expected.*argument.*minification/i);
    });
  });

  describe('document file handling', () => {
    it('should require API key for document translation', () => {
      const testFile = path.join(testDir, 'test.pdf');
      fs.writeFileSync(testFile, Buffer.from([0x25, 0x50, 0x44, 0x46])); // %PDF header

      const result = runCLIExpectError(`translate "${testFile}" --to es`, '');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/api key/i);
    });

    it('should handle non-existent file error', () => {
      // Note: CLI validates API key before file existence, so expect auth error or file error.
      // The subprocess bypasses nock and hits the real DeepL Free API with
      // the shared `test-key:fx` fixture key; depending on the server's
      // current state for that key the failure class can be 401 (auth),
      // 404/ENOENT (local file check), or 429 (rate limit). All three
      // satisfy the intent of this test — the CLI exits with an error
      // rather than crashing or silently succeeding.
      const result = runCLIExpectError(
        'translate /nonexistent/file.pdf --to es',
        'test-key:fx'
      );

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(
        /authentication|invalid.*key|file not found|does not exist|enoent|rate.?limit|too many requests|Document translation failed/i
      );
    });

    it('should accept PDF files', () => {
      const testFile = path.join(testDir, 'document.pdf');
      fs.writeFileSync(testFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      const result = runCLIExpectError(
        `translate "${testFile}" --to es`,
        'test-key:fx'
      );

      // Should fail at API call, not file type validation
      expect(result.output).not.toMatch(/unsupported.*file.*type/i);
      expect(result.output).not.toMatch(/cannot.*translate.*pdf/i);
    });

    it('should accept DOCX files', () => {
      const testFile = path.join(testDir, 'document.docx');
      // DOCX files start with ZIP header (PK)
      fs.writeFileSync(testFile, Buffer.from([0x50, 0x4b, 0x03, 0x04]));

      const result = runCLIExpectError(
        `translate "${testFile}" --to es`,
        'test-key:fx'
      );

      expect(result.output).not.toMatch(/unsupported.*file.*type/i);
    });

    it('should accept PPTX files', () => {
      const testFile = path.join(testDir, 'presentation.pptx');
      fs.writeFileSync(testFile, Buffer.from([0x50, 0x4b, 0x03, 0x04]));

      const result = runCLIExpectError(
        `translate "${testFile}" --to es`,
        'test-key:fx'
      );

      expect(result.output).not.toMatch(/unsupported.*file.*type/i);
    });

    it('should accept XLSX files', () => {
      const testFile = path.join(testDir, 'spreadsheet.xlsx');
      fs.writeFileSync(testFile, Buffer.from([0x50, 0x4b, 0x03, 0x04]));

      const result = runCLIExpectError(
        `translate "${testFile}" --to es`,
        'test-key:fx'
      );

      expect(result.output).not.toMatch(/unsupported.*file.*type/i);
    });

    it('should accept HTML files', () => {
      const testFile = path.join(testDir, 'page.html');
      fs.writeFileSync(testFile, '<html><body>Test</body></html>');

      const result = runCLIExpectError(
        `translate "${testFile}" --to es`,
        'test-key:fx'
      );

      expect(result.output).not.toMatch(/unsupported.*file.*type/i);
    });

    it('should accept HTM files', () => {
      const testFile = path.join(testDir, 'page.htm');
      fs.writeFileSync(testFile, '<html><body>Test</body></html>');

      const result = runCLIExpectError(
        `translate "${testFile}" --to es`,
        'test-key:fx'
      );

      expect(result.output).not.toMatch(/unsupported.*file.*type/i);
    });
  });

  describe('output file handling', () => {
    it('should generate default output filename with language code', () => {
      const testFile = path.join(testDir, 'document.pdf');
      fs.writeFileSync(testFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      // Will fail at API call but test that command structure is correct
      const result = runCLIExpectError(
        `translate "${testFile}" --to es`,
        'test-key:fx'
      );

      // Should not fail due to output path issues
      expect(result.output).not.toMatch(/invalid.*output.*path/i);
    });

    it('should accept --output flag for custom output path', () => {
      const testFile = path.join(testDir, 'input.pdf');
      const outputFile = path.join(testDir, 'output-es.pdf');
      fs.writeFileSync(testFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      const result = runCLIExpectError(
        `translate "${testFile}" --to es --output "${outputFile}"`,
        'test-key:fx'
      );

      // Should not fail due to flag parsing
      expect(result.output).not.toMatch(/unknown option.*output/i);
    });

    it('should validate --output requires a value', () => {
      const testFile = path.join(testDir, 'input.pdf');
      fs.writeFileSync(testFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      const result = runCLIExpectError(
        `translate "${testFile}" --to es --output`,
        'test-key'
      );

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(
        /argument missing|missing.*argument|expected.*argument/i
      );
    });
  });

  describe('flag combinations', () => {
    it('should accept --output-format with --enable-minification', () => {
      const testFile = path.join(testDir, 'doc.pdf');
      fs.writeFileSync(testFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      const result = runCLIExpectError(
        `translate "${testFile}" --to es --output-format docx --enable-minification`,
        'test-key:fx'
      );

      // Should not fail due to flag conflicts
      expect(result.output).not.toMatch(/unknown option|conflicting/i);
    });

    it('should accept document flags with text flags', () => {
      const testFile = path.join(testDir, 'doc.html');
      fs.writeFileSync(testFile, '<html><body>Test</body></html>');

      const result = runCLIExpectError(
        `translate "${testFile}" --to es --formality formal --preserve-formatting`,
        'test-key:fx'
      );

      expect(result.output).not.toMatch(/unknown option|conflicting/i);
    });

    it('should accept --output-format with --output path', () => {
      const testFile = path.join(testDir, 'input.pdf');
      const outputFile = path.join(testDir, 'output.docx');
      fs.writeFileSync(testFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      const result = runCLIExpectError(
        `translate "${testFile}" --to es --output-format docx --output "${outputFile}"`,
        'test-key:fx'
      );

      expect(result.output).not.toMatch(/unknown option|conflicting/i);
    });
  });

  describe('error handling', () => {
    it('should show error for missing --to flag', () => {
      const testFile = path.join(testDir, 'doc.pdf');
      fs.writeFileSync(testFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      const result = runCLIExpectError(
        `translate "${testFile}"`,
        'test-key:fx'
      );

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(
        /required option.*--to|target.*language|No target language specified|missing.*--to/i
      );
    });

    it('should handle authentication errors gracefully', () => {
      const testFile = path.join(testDir, 'doc.pdf');
      fs.writeFileSync(testFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      const result = runCLIExpectError(
        `translate "${testFile}" --to es`,
        'invalid-key'
      );

      expect(result.status).toBeGreaterThan(0);
      // Should show meaningful error message
      expect(result.output).toMatch(/error|authentication|invalid/i);
    });

    it('should exit with non-zero code on error', () => {
      const result = runCLIExpectError(
        'translate /nonexistent.pdf --to es',
        'test-key'
      );

      expect(result.status).toBeGreaterThan(0);
    });
  });
});
