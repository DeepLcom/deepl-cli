/**
 * Integration Tests for Document Translation Workflow
 * Tests the multi-step upload -> poll -> download flow with nock HTTP mocking.
 * Every case is service-level; CLI flag and exit-code behavior lives in
 * tests/e2e/cli-document-translation.e2e.test.ts.
 */

import nock from 'nock';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DeepLClient } from '../../src/api/deepl-client.js';
import { DocumentTranslationService } from '../../src/services/document-translation.js';
import { DEEPL_FREE_API_URL } from '../helpers';

const FREE_API_URL = DEEPL_FREE_API_URL;
const API_KEY = 'test-api-key-integration:fx';

describe('Document Translation Integration', () => {
  let testDir: string;
  const clients: DeepLClient[] = [];

  beforeAll(() => {
    testDir = path.join(os.tmpdir(), `.deepl-doc-integration-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    clients.forEach((c) => c.destroy());
    clients.length = 0;
    nock.cleanAll();
  });

  describe('Service-level: glossaries on the multipart upload', () => {
    const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    /**
     * Runs one upload and hands back the raw multipart body, so the encoding
     * the API actually requires is asserted rather than assumed.
     */
    const uploadWith = async (
      glossary: { glossaryId?: string; glossaryIds?: string[] },
      label: string
    ): Promise<string> => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, `glossary-${label}.pdf`);
      const outputPath = path.join(testDir, `glossary-${label}-out.pdf`);
      fs.writeFileSync(inputPath, Buffer.from('%PDF-1.4 test content'));

      let capturedBody = '';
      nock(FREE_API_URL)
        .post('/v2/document', (body: string) => {
          capturedBody = body;
          return true;
        })
        .reply(200, {
          document_id: `doc-${label}`,
          document_key: `key-${label}`,
        });

      nock(FREE_API_URL)
        .post(`/v2/document/doc-${label}`)
        .reply(200, {
          document_id: `doc-${label}`,
          status: 'done',
          billed_characters: 10,
        });

      nock(FREE_API_URL)
        .post(`/v2/document/doc-${label}/result`)
        .reply(200, Buffer.from('%PDF-1.4 translated'));

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'de',
        sourceLang: 'en',
        ...glossary,
      });

      return capturedBody;
    };

    it('sends glossary_id for a single glossary', async () => {
      const body = await uploadWith({ glossaryId: A }, 'single');

      expect(body).toContain('name="glossary_id"');
      expect(body).toContain(A);
      expect(body).not.toContain('name="glossary_ids"');
    });

    /**
     * Multipart uploads keep only the first of several repeated fields, so the
     * IDs must arrive comma-joined with no whitespace or the API silently
     * applies just one glossary.
     */
    it('comma-joins several glossaries into one glossary_ids field', async () => {
      const body = await uploadWith({ glossaryIds: [A, B] }, 'multi');

      expect(body).toContain('name="glossary_ids"');
      expect(body).toContain(`${A},${B}`);
      expect(body.match(/name="glossary_ids"/g)).toHaveLength(1);
      expect(body).not.toContain(`${A}, ${B}`);
    });

    it('preserves the given order, which selects the winning glossary', async () => {
      const body = await uploadWith({ glossaryIds: [B, A] }, 'reversed');

      expect(body).toContain(`${B},${A}`);
    });

    it('sends no glossary field when none is selected', async () => {
      const body = await uploadWith({}, 'none');

      expect(body).not.toContain('name="glossary_id"');
      expect(body).not.toContain('name="glossary_ids"');
    });
  });

  describe('Service-level: happy path (upload -> poll -> download)', () => {
    it('should complete the full document translation workflow', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-happy.pdf');
      const outputPath = path.join(testDir, 'output-happy.pdf');
      fs.writeFileSync(inputPath, Buffer.from('%PDF-1.4 test content'));

      // Step 1: Upload
      const uploadScope = nock(FREE_API_URL)
        .post('/v2/document', (body: string) => {
          return (
            body.includes('target_lang') && body.includes('input-happy.pdf')
          );
        })
        .reply(200, {
          document_id: 'doc-happy-123',
          document_key: 'key-happy-456',
        });

      // Step 2: Poll - queued
      const pollQueued = nock(FREE_API_URL)
        .post('/v2/document/doc-happy-123', (body: Record<string, string>) => {
          expect(body['document_key']).toBe('key-happy-456');
          return true;
        })
        .reply(200, {
          document_id: 'doc-happy-123',
          status: 'queued',
        });

      // Step 3: Poll - translating
      const pollTranslating = nock(FREE_API_URL)
        .post('/v2/document/doc-happy-123')
        .reply(200, {
          document_id: 'doc-happy-123',
          status: 'translating',
          seconds_remaining: 5,
        });

      // Step 4: Poll - done
      const pollDone = nock(FREE_API_URL)
        .post('/v2/document/doc-happy-123')
        .reply(200, {
          document_id: 'doc-happy-123',
          status: 'done',
          billed_characters: 1500,
        });

      // Step 5: Download
      const translatedContent = Buffer.from('%PDF-1.4 translated content');
      const downloadScope = nock(FREE_API_URL)
        .post(
          '/v2/document/doc-happy-123/result',
          (body: Record<string, string>) => {
            expect(body['document_key']).toBe('key-happy-456');
            return true;
          }
        )
        .reply(200, translatedContent);

      const progressUpdates: string[] = [];
      const result = await service.translateDocument(
        inputPath,
        outputPath,
        { targetLang: 'es' },
        (progress) => {
          progressUpdates.push(progress.status);
        }
      );

      expect(result.success).toBe(true);
      expect(result.billedCharacters).toBe(1500);
      expect(result.outputPath).toBe(outputPath);
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.readFileSync(outputPath).toString()).toBe(
        '%PDF-1.4 translated content'
      );

      expect(progressUpdates).toEqual(['queued', 'translating', 'done']);

      expect(uploadScope.isDone()).toBe(true);
      expect(pollQueued.isDone()).toBe(true);
      expect(pollTranslating.isDone()).toBe(true);
      expect(pollDone.isDone()).toBe(true);
      expect(downloadScope.isDone()).toBe(true);
    });

    it('should handle immediate "done" status without intermediate polling', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-fast.txt');
      const outputPath = path.join(testDir, 'output-fast.txt');
      fs.writeFileSync(inputPath, 'Short text');

      nock(FREE_API_URL)
        .post('/v2/document')
        .reply(200, { document_id: 'doc-fast', document_key: 'key-fast' });

      nock(FREE_API_URL).post('/v2/document/doc-fast').reply(200, {
        document_id: 'doc-fast',
        status: 'done',
        billed_characters: 10,
      });

      nock(FREE_API_URL)
        .post('/v2/document/doc-fast/result')
        .reply(200, Buffer.from('Texto corto'));

      const result = await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
      });

      expect(result.success).toBe(true);
      expect(result.billedCharacters).toBe(10);
      expect(fs.readFileSync(outputPath, 'utf-8')).toBe('Texto corto');
    });
  });

  describe('Service-level: upload request structure validation', () => {
    it('should send target_lang in uppercase in multipart form', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-struct.pdf');
      const outputPath = path.join(testDir, 'output-struct.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test content'));

      const uploadScope = nock(FREE_API_URL)
        .post('/v2/document', (body: string) => {
          expect(body).toContain('ES');
          return true;
        })
        .reply(200, { document_id: 'd1', document_key: 'k1' });

      nock(FREE_API_URL).post('/v2/document/d1').reply(200, {
        document_id: 'd1',
        status: 'done',
        billed_characters: 5,
      });

      nock(FREE_API_URL)
        .post('/v2/document/d1/result')
        .reply(200, Buffer.from('translated'));

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
      });
      expect(uploadScope.isDone()).toBe(true);
    });

    it('should include source_lang when specified', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-src.pdf');
      const outputPath = path.join(testDir, 'output-src.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      const uploadScope = nock(FREE_API_URL)
        .post('/v2/document', (body: string) => {
          expect(body).toContain('source_lang');
          expect(body).toContain('EN');
          return true;
        })
        .reply(200, { document_id: 'd2', document_key: 'k2' });

      nock(FREE_API_URL).post('/v2/document/d2').reply(200, {
        document_id: 'd2',
        status: 'done',
        billed_characters: 4,
      });

      nock(FREE_API_URL)
        .post('/v2/document/d2/result')
        .reply(200, Buffer.from('t'));

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
        sourceLang: 'en',
      });
      expect(uploadScope.isDone()).toBe(true);
    });

    it('should include formality when specified', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-form.pdf');
      const outputPath = path.join(testDir, 'output-form.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      const uploadScope = nock(FREE_API_URL)
        .post('/v2/document', (body: string) => {
          expect(body).toContain('formality');
          expect(body).toContain('more');
          return true;
        })
        .reply(200, { document_id: 'd3', document_key: 'k3' });

      nock(FREE_API_URL).post('/v2/document/d3').reply(200, {
        document_id: 'd3',
        status: 'done',
        billed_characters: 4,
      });

      nock(FREE_API_URL)
        .post('/v2/document/d3/result')
        .reply(200, Buffer.from('t'));

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
        formality: 'more',
      });
      expect(uploadScope.isDone()).toBe(true);
    });

    it('should include glossary_id when specified', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-gloss.pdf');
      const outputPath = path.join(testDir, 'output-gloss.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      const uploadScope = nock(FREE_API_URL)
        .post('/v2/document', (body: string) => {
          expect(body).toContain('glossary_id');
          expect(body).toContain('glossary-abc-123');
          return true;
        })
        .reply(200, { document_id: 'd4', document_key: 'k4' });

      nock(FREE_API_URL).post('/v2/document/d4').reply(200, {
        document_id: 'd4',
        status: 'done',
        billed_characters: 4,
      });

      nock(FREE_API_URL)
        .post('/v2/document/d4/result')
        .reply(200, Buffer.from('t'));

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
        glossaryId: 'glossary-abc-123',
      });
      expect(uploadScope.isDone()).toBe(true);
    });

    it('should include output_format when specified', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-fmt.docx');
      const outputPath = path.join(testDir, 'output-fmt.pdf');
      fs.writeFileSync(inputPath, Buffer.from('docx content'));

      const uploadScope = nock(FREE_API_URL)
        .post('/v2/document', (body: string) => {
          expect(body).toContain('output_format');
          expect(body).toContain('pdf');
          return true;
        })
        .reply(200, { document_id: 'd5', document_key: 'k5' });

      nock(FREE_API_URL).post('/v2/document/d5').reply(200, {
        document_id: 'd5',
        status: 'done',
        billed_characters: 12,
      });

      nock(FREE_API_URL)
        .post('/v2/document/d5/result')
        .reply(200, Buffer.from('%PDF'));

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
        outputFormat: 'pdf',
      });
      expect(uploadScope.isDone()).toBe(true);
    });

    it('should include enable_document_minification when specified', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-min.docx');
      const outputPath = path.join(testDir, 'output-min.docx');
      fs.writeFileSync(inputPath, Buffer.from('docx content'));

      const uploadScope = nock(FREE_API_URL)
        .post('/v2/document', (body: string) => {
          expect(body).toContain('enable_document_minification');
          return true;
        })
        .reply(200, { document_id: 'd6', document_key: 'k6' });

      nock(FREE_API_URL).post('/v2/document/d6').reply(200, {
        document_id: 'd6',
        status: 'done',
        billed_characters: 12,
      });

      nock(FREE_API_URL)
        .post('/v2/document/d6/result')
        .reply(200, Buffer.from('minified'));

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
        enableDocumentMinification: true,
      });
      expect(uploadScope.isDone()).toBe(true);
    });

    it('should use correct Authorization header for document upload', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-auth.pdf');
      const outputPath = path.join(testDir, 'output-auth.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      const uploadScope = nock(FREE_API_URL, {
        reqheaders: {
          authorization: `DeepL-Auth-Key ${API_KEY}`,
        },
      })
        .post('/v2/document')
        .reply(200, { document_id: 'da', document_key: 'ka' });

      nock(FREE_API_URL).post('/v2/document/da').reply(200, {
        document_id: 'da',
        status: 'done',
        billed_characters: 4,
      });

      nock(FREE_API_URL)
        .post('/v2/document/da/result')
        .reply(200, Buffer.from('t'));

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'de',
      });
      expect(uploadScope.isDone()).toBe(true);
    });
  });

  describe('Service-level: polling request structure validation', () => {
    it('should POST document_key as form-encoded body to status endpoint', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-poll-struct.pdf');
      const outputPath = path.join(testDir, 'output-poll-struct.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      nock(FREE_API_URL)
        .post('/v2/document')
        .reply(200, { document_id: 'dp1', document_key: 'kp1' });

      const pollScope = nock(FREE_API_URL, {
        reqheaders: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      })
        .post('/v2/document/dp1', (body: Record<string, string>) => {
          expect(body['document_key']).toBe('kp1');
          return true;
        })
        .reply(200, {
          document_id: 'dp1',
          status: 'done',
          billed_characters: 4,
        });

      nock(FREE_API_URL)
        .post('/v2/document/dp1/result')
        .reply(200, Buffer.from('t'));

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'fr',
      });
      expect(pollScope.isDone()).toBe(true);
    });
  });

  describe('Service-level: download request structure validation', () => {
    it('should POST document_key as form-encoded body to result endpoint', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-dl-struct.pdf');
      const outputPath = path.join(testDir, 'output-dl-struct.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      nock(FREE_API_URL)
        .post('/v2/document')
        .reply(200, { document_id: 'dd1', document_key: 'kd1' });

      nock(FREE_API_URL).post('/v2/document/dd1').reply(200, {
        document_id: 'dd1',
        status: 'done',
        billed_characters: 4,
      });

      const downloadScope = nock(FREE_API_URL, {
        reqheaders: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      })
        .post('/v2/document/dd1/result', (body: Record<string, string>) => {
          expect(body['document_key']).toBe('kd1');
          return true;
        })
        .reply(200, Buffer.from('translated'));

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'fr',
      });
      expect(downloadScope.isDone()).toBe(true);
    });

    it('should handle binary content correctly', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-binary.pdf');
      const outputPath = path.join(testDir, 'output-binary.pdf');
      fs.writeFileSync(inputPath, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      nock(FREE_API_URL)
        .post('/v2/document')
        .reply(200, { document_id: 'db1', document_key: 'kb1' });

      nock(FREE_API_URL).post('/v2/document/db1').reply(200, {
        document_id: 'db1',
        status: 'done',
        billed_characters: 100,
      });

      const pdfBytes = Buffer.from([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
      ]);
      nock(FREE_API_URL).post('/v2/document/db1/result').reply(200, pdfBytes);

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'de',
      });

      const outputBuffer = fs.readFileSync(outputPath);
      expect(outputBuffer[0]).toBe(0x25); // %
      expect(outputBuffer[1]).toBe(0x50); // P
      expect(outputBuffer[2]).toBe(0x44); // D
      expect(outputBuffer[3]).toBe(0x46); // F
    });
  });

  describe('Service-level: upload error handling', () => {
    it('should throw on 403 authentication error during upload', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-403.pdf');
      const outputPath = path.join(testDir, 'output-403.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      nock(FREE_API_URL)
        .post('/v2/document')
        .reply(403, { message: 'Authorization failed' });

      await expect(
        service.translateDocument(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow('Authentication failed');
    });

    it('should throw on 413 file too large error during upload', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-413.pdf');
      const outputPath = path.join(testDir, 'output-413.pdf');
      fs.writeFileSync(inputPath, Buffer.from('large content'));

      nock(FREE_API_URL)
        .post('/v2/document')
        .reply(413, { message: 'File too large' });

      await expect(
        service.translateDocument(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow(/API error/);
    });

    it('should throw on 456 quota exceeded error during upload', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-456.pdf');
      const outputPath = path.join(testDir, 'output-456.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      nock(FREE_API_URL)
        .post('/v2/document')
        .reply(456, { message: 'Quota exceeded' });

      await expect(
        service.translateDocument(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow('Quota exceeded');
    });

    it('should throw for non-existent input file', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      await expect(
        service.translateDocument(
          path.join(testDir, 'does-not-exist.pdf'),
          path.join(testDir, 'output.pdf'),
          { targetLang: 'es' }
        )
      ).rejects.toThrow('Input file not found');
    });
  });

  describe('Service-level: polling error handling', () => {
    it('should throw when API returns error status during translation', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-poll-err.pdf');
      const outputPath = path.join(testDir, 'output-poll-err.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      nock(FREE_API_URL)
        .post('/v2/document')
        .reply(200, { document_id: 'de1', document_key: 'ke1' });

      nock(FREE_API_URL).post('/v2/document/de1').reply(200, {
        document_id: 'de1',
        status: 'error',
        error_message: 'Unsupported file format',
      });

      await expect(
        service.translateDocument(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow('Document translation failed: Unsupported file format');
    });

    it('should throw when polling returns 404 document not found', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-poll-404.pdf');
      const outputPath = path.join(testDir, 'output-poll-404.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      nock(FREE_API_URL)
        .post('/v2/document')
        .reply(200, { document_id: 'de2', document_key: 'ke2' });

      nock(FREE_API_URL)
        .post('/v2/document/de2')
        .reply(404, { message: 'Document not found' });

      await expect(
        service.translateDocument(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow('API error');
    });

    it('should report error status via progress callback', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-poll-cb.pdf');
      const outputPath = path.join(testDir, 'output-poll-cb.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      nock(FREE_API_URL)
        .post('/v2/document')
        .reply(200, { document_id: 'de3', document_key: 'ke3' });

      nock(FREE_API_URL).post('/v2/document/de3').reply(200, {
        document_id: 'de3',
        status: 'error',
        error_message: 'Internal processing error',
      });

      const progressUpdates: Array<{ status: string; errorMessage?: string }> =
        [];

      await expect(
        service.translateDocument(
          inputPath,
          outputPath,
          { targetLang: 'es' },
          (progress) => {
            progressUpdates.push({
              status: progress.status,
              errorMessage: progress.errorMessage,
            });
          }
        )
      ).rejects.toThrow('Document translation failed');

      expect(progressUpdates).toEqual([
        { status: 'error', errorMessage: 'Internal processing error' },
      ]);
    });
  });

  describe('Service-level: download error handling', () => {
    it('should throw when download returns 404', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-dl-404.pdf');
      const outputPath = path.join(testDir, 'output-dl-404.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      nock(FREE_API_URL)
        .post('/v2/document')
        .reply(200, { document_id: 'ddl1', document_key: 'kdl1' });

      nock(FREE_API_URL).post('/v2/document/ddl1').reply(200, {
        document_id: 'ddl1',
        status: 'done',
        billed_characters: 4,
      });

      nock(FREE_API_URL)
        .post('/v2/document/ddl1/result')
        .reply(404, { message: 'Document not found' });

      await expect(
        service.translateDocument(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow('API error');
    });

    it('should throw when download returns 503 service unavailable', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-dl-503.pdf');
      const outputPath = path.join(testDir, 'output-dl-503.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      nock(FREE_API_URL)
        .post('/v2/document')
        .reply(200, { document_id: 'ddl2', document_key: 'kdl2' });

      nock(FREE_API_URL).post('/v2/document/ddl2').reply(200, {
        document_id: 'ddl2',
        status: 'done',
        billed_characters: 4,
      });

      nock(FREE_API_URL)
        .post('/v2/document/ddl2/result')
        .reply(503, { message: 'Service temporarily unavailable' });

      await expect(
        service.translateDocument(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow('Service temporarily unavailable');
    });
  });

  describe('Service-level: output directory creation', () => {
    it('should create output directory if it does not exist', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-mkdir.pdf');
      const nestedOutputPath = path.join(
        testDir,
        'nested',
        'deep',
        'output-mkdir.pdf'
      );
      fs.writeFileSync(inputPath, Buffer.from('test'));

      nock(FREE_API_URL)
        .post('/v2/document')
        .reply(200, { document_id: 'dm1', document_key: 'km1' });

      nock(FREE_API_URL).post('/v2/document/dm1').reply(200, {
        document_id: 'dm1',
        status: 'done',
        billed_characters: 4,
      });

      nock(FREE_API_URL)
        .post('/v2/document/dm1/result')
        .reply(200, Buffer.from('translated'));

      const result = await service.translateDocument(
        inputPath,
        nestedOutputPath,
        { targetLang: 'es' }
      );

      expect(result.success).toBe(true);
      expect(fs.existsSync(nestedOutputPath)).toBe(true);
    });
  });

  describe('Service-level: document minification validation', () => {
    it('should reject minification for non-PPTX/DOCX files', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-min-reject.pdf');
      const outputPath = path.join(testDir, 'output-min-reject.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      await expect(
        service.translateDocument(inputPath, outputPath, {
          targetLang: 'es',
          enableDocumentMinification: true,
        })
      ).rejects.toThrow(
        'Document minification is only supported for PPTX and DOCX'
      );
    });
  });

  describe('Service-level: a hostile document_id in the upload response', () => {
    it('aborts the workflow, issues no follow-up request, and writes no output', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-traversal.pdf');
      const outputPath = path.join(testDir, 'output-traversal.pdf');
      fs.writeFileSync(inputPath, Buffer.from('%PDF-1.4 test content'));

      const uploadScope = nock(FREE_API_URL).post('/v2/document').reply(200, {
        document_id: '../../v3/glossaries%3fpwned=1',
        document_key: 'kt1',
      });

      // The route the traversal collapses onto. Left unmatched deliberately:
      // nock rejects an unmatched request, so this interceptor existing and
      // staying pending is what proves the request was never issued.
      const traversedScope = nock(FREE_API_URL)
        .post('/v3/glossaries%3fpwned=1')
        .reply(200, { document_id: 'x', status: 'done' });

      await expect(
        service.translateDocument(inputPath, outputPath, { targetLang: 'de' })
      ).rejects.toThrow(/Unexpected API response: document_id/);

      expect(uploadScope.isDone()).toBe(true);
      expect(traversedScope.isDone()).toBe(false);
      expect(fs.existsSync(outputPath)).toBe(false);
      nock.cleanAll();
    });
  });

  describe('Service-level: abort signal support', () => {
    it('should cancel translation when abort signal fires', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 0 });
      clients.push(client);
      const service = new DocumentTranslationService(client);

      const inputPath = path.join(testDir, 'input-abort.pdf');
      const outputPath = path.join(testDir, 'output-abort.pdf');
      fs.writeFileSync(inputPath, Buffer.from('test'));

      nock(FREE_API_URL)
        .post('/v2/document')
        .reply(200, { document_id: 'da1', document_key: 'ka1' });

      nock(FREE_API_URL).post('/v2/document/da1').reply(200, {
        document_id: 'da1',
        status: 'translating',
        seconds_remaining: 60,
      });

      const controller = new AbortController();

      const promise = service.translateDocument(
        inputPath,
        outputPath,
        { targetLang: 'es' },
        undefined,
        { abortSignal: controller.signal }
      );

      // Abort after the first poll
      setTimeout(() => controller.abort(), 50);

      await expect(promise).rejects.toThrow('Document translation cancelled');
    });
  });
});
