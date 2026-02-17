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
    return helpers.runCLIExpectError(command, apiKey !== undefined ? { apiKey } : {});
  };

  describe('--output-format flag', () => {
    it('should accept valid output formats', () => {
      // Create a test file
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Test content');

      // Test with valid output formats (will fail at API call, not flag validation)
      const formats = ['docx'];

      for (const format of formats) {
        const result = runCLIExpectError(`translate "${testFile}" --to es --output-format ${format}`, 'test-key:fx');

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

      const result = runCLIExpectError(`translate "${testFile}" --to es --output-format`, 'test-key');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/argument missing|missing.*argument|expected.*argument/i);
    });
  });

  describe('--enable-minification flag', () => {
    it('should be accepted as a boolean flag', () => {
      const testFile = path.join(testDir, 'test.docx');
      // Create a minimal DOCX file (just a placeholder)
      fs.writeFileSync(testFile, Buffer.from([0x50, 0x4B, 0x03, 0x04])); // ZIP header

      const result = runCLIExpectError(`translate "${testFile}" --to es --enable-minification`, 'test-key:fx');

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
      fs.writeFileSync(testFile, Buffer.from([0x50, 0x4B]));

      // Test that the flag works without a value
      const result = runCLIExpectError(`translate "${testFile}" --to es --enable-minification`, 'test-key:fx');

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
      // Note: CLI validates API key before file existence, so expect auth error or file error
      const result = runCLIExpectError('translate /nonexistent/file.pdf --to es', 'test-key:fx');

      expect(result.status).toBeGreaterThan(0);
      // Will fail with either auth error (checked first) or file not found error
      expect(result.output).toMatch(/authentication|invalid.*key|file not found|does not exist|enoent/i);
    });

    it('should accept PDF files', () => {
      const testFile = path.join(testDir, 'document.pdf');
      fs.writeFileSync(testFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      const result = runCLIExpectError(`translate "${testFile}" --to es`, 'test-key:fx');

      // Should fail at API call, not file type validation
      expect(result.output).not.toMatch(/unsupported.*file.*type/i);
      expect(result.output).not.toMatch(/cannot.*translate.*pdf/i);
    });

    it('should accept DOCX files', () => {
      const testFile = path.join(testDir, 'document.docx');
      // DOCX files start with ZIP header (PK)
      fs.writeFileSync(testFile, Buffer.from([0x50, 0x4B, 0x03, 0x04]));

      const result = runCLIExpectError(`translate "${testFile}" --to es`, 'test-key:fx');

      expect(result.output).not.toMatch(/unsupported.*file.*type/i);
    });

    it('should accept PPTX files', () => {
      const testFile = path.join(testDir, 'presentation.pptx');
      fs.writeFileSync(testFile, Buffer.from([0x50, 0x4B, 0x03, 0x04]));

      const result = runCLIExpectError(`translate "${testFile}" --to es`, 'test-key:fx');

      expect(result.output).not.toMatch(/unsupported.*file.*type/i);
    });

    it('should accept XLSX files', () => {
      const testFile = path.join(testDir, 'spreadsheet.xlsx');
      fs.writeFileSync(testFile, Buffer.from([0x50, 0x4B, 0x03, 0x04]));

      const result = runCLIExpectError(`translate "${testFile}" --to es`, 'test-key:fx');

      expect(result.output).not.toMatch(/unsupported.*file.*type/i);
    });

    it('should accept HTML files', () => {
      const testFile = path.join(testDir, 'page.html');
      fs.writeFileSync(testFile, '<html><body>Test</body></html>');

      const result = runCLIExpectError(`translate "${testFile}" --to es`, 'test-key:fx');

      expect(result.output).not.toMatch(/unsupported.*file.*type/i);
    });

    it('should accept HTM files', () => {
      const testFile = path.join(testDir, 'page.htm');
      fs.writeFileSync(testFile, '<html><body>Test</body></html>');

      const result = runCLIExpectError(`translate "${testFile}" --to es`, 'test-key:fx');

      expect(result.output).not.toMatch(/unsupported.*file.*type/i);
    });
  });

  describe('output file handling', () => {
    it('should generate default output filename with language code', () => {
      const testFile = path.join(testDir, 'document.pdf');
      fs.writeFileSync(testFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      // Will fail at API call but test that command structure is correct
      const result = runCLIExpectError(`translate "${testFile}" --to es`, 'test-key:fx');

      // Should not fail due to output path issues
      expect(result.output).not.toMatch(/invalid.*output.*path/i);
    });

    it('should accept --output flag for custom output path', () => {
      const testFile = path.join(testDir, 'input.pdf');
      const outputFile = path.join(testDir, 'output-es.pdf');
      fs.writeFileSync(testFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      const result = runCLIExpectError(`translate "${testFile}" --to es --output "${outputFile}"`, 'test-key:fx');

      // Should not fail due to flag parsing
      expect(result.output).not.toMatch(/unknown option.*output/i);
    });

    it('should validate --output requires a value', () => {
      const testFile = path.join(testDir, 'input.pdf');
      fs.writeFileSync(testFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      const result = runCLIExpectError(`translate "${testFile}" --to es --output`, 'test-key');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/argument missing|missing.*argument|expected.*argument/i);
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

      const result = runCLIExpectError(`translate "${testFile}"`, 'test-key:fx');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/required option.*--to|target.*language|No target language specified|missing.*--to/i);
    });

    it('should handle authentication errors gracefully', () => {
      const testFile = path.join(testDir, 'doc.pdf');
      fs.writeFileSync(testFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      const result = runCLIExpectError(`translate "${testFile}" --to es`, 'invalid-key');

      expect(result.status).toBeGreaterThan(0);
      // Should show meaningful error message
      expect(result.output).toMatch(/error|authentication|invalid/i);
    });

    it('should exit with non-zero code on error', () => {
      const result = runCLIExpectError('translate /nonexistent.pdf --to es', 'test-key');

      expect(result.status).toBeGreaterThan(0);
    });
  });

});
