/**
 * Document Translation Service Tests
 * Tests for complete document translation workflow with polling
 */

import { DocumentTranslationService, MAX_DOCUMENT_FILE_SIZE } from '../../src/services/document-translation.js';
import { DeepLClient } from '../../src/api/deepl-client.js';

// Mock the DeepL client
jest.mock('../../src/api/deepl-client.js');

// Mock fs module with jest.mock
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockLstatSync = jest.fn();
const mockStatSync = jest.fn();

jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  lstatSync: (...args: unknown[]) => mockLstatSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
  promises: {
    lstat: jest.fn(),
    readFile: jest.fn(),
  },
}));

const MockedDeepLClient = DeepLClient as jest.MockedClass<typeof DeepLClient>;

describe('DocumentTranslationService', () => {
  let service: DocumentTranslationService;
  let mockClient: jest.Mocked<DeepLClient>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup default fs mock behaviors
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from('test'));
    mockWriteFileSync.mockImplementation(() => {});
    mockMkdirSync.mockImplementation(() => '');
    mockLstatSync.mockReturnValue({ isSymbolicLink: () => false });
    mockStatSync.mockReturnValue({ size: 1024 }); // 1 KB default

    mockClient = new MockedDeepLClient('test-key') as jest.Mocked<DeepLClient>;
    service = new DocumentTranslationService(mockClient);
  });

  describe('translateDocument', () => {
    it('should upload, poll, and download document successfully', async () => {
      const inputPath = '/test/document.pdf';
      const outputPath = '/test/document.es.pdf';
      const fileBuffer = Buffer.from('test pdf content');
      const translatedBuffer = Buffer.from('translated pdf content');

      // Override fs mocks for this test
      mockReadFileSync.mockReturnValue(fileBuffer);

      // Mock DeepL client methods
      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      mockClient.getDocumentStatus = jest.fn()
        .mockResolvedValueOnce({
          documentId: 'doc-123',
          status: 'queued',
        })
        .mockResolvedValueOnce({
          documentId: 'doc-123',
          status: 'translating',
          secondsRemaining: 10,
        })
        .mockResolvedValueOnce({
          documentId: 'doc-123',
          status: 'done',
          billedCharacters: 500,
        });

      mockClient.downloadDocument = jest.fn().mockResolvedValue(translatedBuffer);

      const result = await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
      });

      expect(result).toEqual({
        success: true,
        billedCharacters: 500,
        outputPath: outputPath,
      });

      expect(mockClient.uploadDocument).toHaveBeenCalledWith(
        fileBuffer,
        expect.objectContaining({
          targetLang: 'es',
          filename: 'document.pdf',
        })
      );

      expect(mockClient.getDocumentStatus).toHaveBeenCalledTimes(3);
      expect(mockClient.downloadDocument).toHaveBeenCalledWith({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        outputPath,
        translatedBuffer
      );
    });

    it('should throw error if input file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      await expect(
        service.translateDocument('/nonexistent.pdf', '/output.pdf', {
          targetLang: 'es',
        })
      ).rejects.toThrow('Input file not found: /nonexistent.pdf');
    });

    it('should handle translation error status', async () => {
      const inputPath = '/test/doc.pdf';
      const outputPath = '/test/doc.es.pdf';
      const fileBuffer = Buffer.from('content');

      mockReadFileSync.mockReturnValue(fileBuffer);

      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      mockClient.getDocumentStatus = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        status: 'error',
        errorMessage: 'Unsupported file format',
      });

      await expect(
        service.translateDocument(inputPath, outputPath, {
          targetLang: 'es',
        })
      ).rejects.toThrow('Document translation failed: Unsupported file format');
    });

    it('should call progress callback during polling', async () => {
      const inputPath = '/test/doc.pdf';
      const outputPath = '/test/doc.es.pdf';
      const fileBuffer = Buffer.from('content');
      const progressCallback = jest.fn();

      mockReadFileSync.mockReturnValue(fileBuffer);

      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      mockClient.getDocumentStatus = jest.fn()
        .mockResolvedValueOnce({
          documentId: 'doc-123',
          status: 'queued',
        })
        .mockResolvedValueOnce({
          documentId: 'doc-123',
          status: 'translating',
          secondsRemaining: 5,
        })
        .mockResolvedValueOnce({
          documentId: 'doc-123',
          status: 'done',
        });

      mockClient.downloadDocument = jest.fn().mockResolvedValue(Buffer.from('translated'));

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
      }, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith({
        status: 'queued',
        secondsRemaining: undefined,
        billedCharacters: undefined,
        errorMessage: undefined,
      });

      expect(progressCallback).toHaveBeenCalledWith({
        status: 'translating',
        secondsRemaining: 5,
        billedCharacters: undefined,
        errorMessage: undefined,
      });

      expect(progressCallback).toHaveBeenCalledWith({
        status: 'done',
        secondsRemaining: undefined,
        billedCharacters: undefined,
        errorMessage: undefined,
      });
    });

    it('should poll multiple times with exponential backoff', async () => {
      const inputPath = '/test/doc.pdf';
      const outputPath = '/test/doc.es.pdf';
      const fileBuffer = Buffer.from('content');

      mockReadFileSync.mockReturnValue(fileBuffer);

      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      // Mock multiple polling attempts
      mockClient.getDocumentStatus = jest.fn()
        .mockResolvedValueOnce({ documentId: 'doc-123', status: 'queued' })
        .mockResolvedValueOnce({ documentId: 'doc-123', status: 'queued' })
        .mockResolvedValueOnce({ documentId: 'doc-123', status: 'translating' })
        .mockResolvedValueOnce({ documentId: 'doc-123', status: 'translating' })
        .mockResolvedValueOnce({ documentId: 'doc-123', status: 'done' });

      mockClient.downloadDocument = jest.fn().mockResolvedValue(Buffer.from('translated'));

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
      });

      // Should have made 5 status checks
      expect(mockClient.getDocumentStatus).toHaveBeenCalledTimes(5);
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should pass outputFormat parameter to API client', async () => {
      const inputPath = '/test/document.docx';
      const outputPath = '/test/document.es.pdf';
      const fileBuffer = Buffer.from('docx content');
      const translatedBuffer = Buffer.from('translated pdf content');

      mockReadFileSync.mockReturnValue(fileBuffer);

      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      mockClient.getDocumentStatus = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        status: 'done',
        billedCharacters: 500,
      });

      mockClient.downloadDocument = jest.fn().mockResolvedValue(translatedBuffer);

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
        outputFormat: 'pdf',
      });

      // Verify outputFormat is passed to uploadDocument
      expect(mockClient.uploadDocument).toHaveBeenCalledWith(
        fileBuffer,
        expect.objectContaining({
          targetLang: 'es',
          filename: 'document.docx',
          outputFormat: 'pdf',
        })
      );
    });

    it('should translate document without outputFormat when not specified', async () => {
      const inputPath = '/test/document.pdf';
      const outputPath = '/test/document.es.pdf';
      const fileBuffer = Buffer.from('pdf content');
      const translatedBuffer = Buffer.from('translated pdf content');

      mockReadFileSync.mockReturnValue(fileBuffer);

      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      mockClient.getDocumentStatus = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        status: 'done',
        billedCharacters: 300,
      });

      mockClient.downloadDocument = jest.fn().mockResolvedValue(translatedBuffer);

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
      });

      // Verify outputFormat is NOT passed when not specified
      expect(mockClient.uploadDocument).toHaveBeenCalledWith(
        fileBuffer,
        expect.not.objectContaining({
          outputFormat: expect.anything(),
        })
      );
    });

    it('should allow enableDocumentMinification for PPTX files', async () => {
      const inputPath = '/test/presentation.pptx';
      const outputPath = '/test/presentation.es.pptx';
      const fileBuffer = Buffer.from('pptx content');
      const translatedBuffer = Buffer.from('translated pptx content');

      mockReadFileSync.mockReturnValue(fileBuffer);

      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      mockClient.getDocumentStatus = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        status: 'done',
      });

      mockClient.downloadDocument = jest.fn().mockResolvedValue(translatedBuffer);

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
        enableDocumentMinification: true,
      });

      // Verify enableDocumentMinification is passed for PPTX
      expect(mockClient.uploadDocument).toHaveBeenCalledWith(
        fileBuffer,
        expect.objectContaining({
          targetLang: 'es',
          filename: 'presentation.pptx',
          enableDocumentMinification: true,
        })
      );
    });

    it('should allow enableDocumentMinification for DOCX files', async () => {
      const inputPath = '/test/document.docx';
      const outputPath = '/test/document.es.docx';
      const fileBuffer = Buffer.from('docx content');
      const translatedBuffer = Buffer.from('translated docx content');

      mockReadFileSync.mockReturnValue(fileBuffer);

      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      mockClient.getDocumentStatus = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        status: 'done',
      });

      mockClient.downloadDocument = jest.fn().mockResolvedValue(translatedBuffer);

      await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
        enableDocumentMinification: true,
      });

      // Verify enableDocumentMinification is passed for DOCX
      expect(mockClient.uploadDocument).toHaveBeenCalledWith(
        fileBuffer,
        expect.objectContaining({
          targetLang: 'es',
          filename: 'document.docx',
          enableDocumentMinification: true,
        })
      );
    });

    it('should reject enableDocumentMinification for PDF files', async () => {
      const inputPath = '/test/document.pdf';
      const outputPath = '/test/document.es.pdf';

      await expect(
        service.translateDocument(inputPath, outputPath, {
          targetLang: 'es',
          enableDocumentMinification: true,
        })
      ).rejects.toThrow('Document minification is only supported for PPTX and DOCX files');

      // uploadDocument should NOT have been called
      expect(mockClient.uploadDocument).not.toHaveBeenCalled();
    });

    it('should reject enableDocumentMinification for TXT files', async () => {
      const inputPath = '/test/document.txt';
      const outputPath = '/test/document.es.txt';

      await expect(
        service.translateDocument(inputPath, outputPath, {
          targetLang: 'es',
          enableDocumentMinification: true,
        })
      ).rejects.toThrow('Document minification is only supported for PPTX and DOCX files');

      expect(mockClient.uploadDocument).not.toHaveBeenCalled();
    });

    it('should reject enableDocumentMinification for XLSX files', async () => {
      const inputPath = '/test/spreadsheet.xlsx';
      const outputPath = '/test/spreadsheet.es.xlsx';

      await expect(
        service.translateDocument(inputPath, outputPath, {
          targetLang: 'es',
          enableDocumentMinification: true,
        })
      ).rejects.toThrow('Document minification is only supported for PPTX and DOCX files');

      expect(mockClient.uploadDocument).not.toHaveBeenCalled();
    });

    it('should reject symlinks for security', async () => {
      const inputPath = '/test/symlink-doc.pdf';
      const outputPath = '/test/output.es.pdf';

      mockLstatSync.mockReturnValue({ isSymbolicLink: () => true });

      await expect(
        service.translateDocument(inputPath, outputPath, {
          targetLang: 'es',
        })
      ).rejects.toThrow('Symlinks are not supported for security reasons');

      expect(mockClient.uploadDocument).not.toHaveBeenCalled();
    });

    it('should reject files exceeding the maximum size limit', async () => {
      const inputPath = '/test/huge-file.pdf';
      const outputPath = '/test/huge-file.es.pdf';

      mockStatSync.mockReturnValue({ size: MAX_DOCUMENT_FILE_SIZE + 1 });

      await expect(
        service.translateDocument(inputPath, outputPath, {
          targetLang: 'es',
        })
      ).rejects.toThrow(/exceeds the maximum allowed size of 30 MB/);

      expect(mockClient.uploadDocument).not.toHaveBeenCalled();
    });

    it('should reject files well above the size limit with correct size in error', async () => {
      const inputPath = '/test/massive-file.pdf';
      const outputPath = '/test/massive-file.es.pdf';

      const fileSize = 100 * 1024 * 1024; // 100 MB
      mockStatSync.mockReturnValue({ size: fileSize });

      await expect(
        service.translateDocument(inputPath, outputPath, {
          targetLang: 'es',
        })
      ).rejects.toThrow('File size (100.0 MB) exceeds the maximum allowed size of 30 MB');

      expect(mockClient.uploadDocument).not.toHaveBeenCalled();
    });

    it('should accept files exactly at the size limit', async () => {
      const inputPath = '/test/exact-limit.pdf';
      const outputPath = '/test/exact-limit.es.pdf';
      const fileBuffer = Buffer.from('content');

      mockStatSync.mockReturnValue({ size: MAX_DOCUMENT_FILE_SIZE });
      mockReadFileSync.mockReturnValue(fileBuffer);

      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      mockClient.getDocumentStatus = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        status: 'done',
        billedCharacters: 200,
      });

      mockClient.downloadDocument = jest.fn().mockResolvedValue(Buffer.from('translated'));

      const result = await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
      });

      expect(result.success).toBe(true);
      expect(mockClient.uploadDocument).toHaveBeenCalled();
    });

    it('should accept files under the size limit', async () => {
      const inputPath = '/test/small-file.pdf';
      const outputPath = '/test/small-file.es.pdf';
      const fileBuffer = Buffer.from('content');

      mockStatSync.mockReturnValue({ size: 1024 * 1024 }); // 1 MB
      mockReadFileSync.mockReturnValue(fileBuffer);

      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      mockClient.getDocumentStatus = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        status: 'done',
      });

      mockClient.downloadDocument = jest.fn().mockResolvedValue(Buffer.from('translated'));

      const result = await service.translateDocument(inputPath, outputPath, {
        targetLang: 'es',
      });

      expect(result.success).toBe(true);
      expect(mockClient.uploadDocument).toHaveBeenCalled();
    });

    it('should include DeepL documentation link in size error message', async () => {
      const inputPath = '/test/big-file.pdf';
      const outputPath = '/test/big-file.es.pdf';

      mockStatSync.mockReturnValue({ size: MAX_DOCUMENT_FILE_SIZE + 1 });

      await expect(
        service.translateDocument(inputPath, outputPath, {
          targetLang: 'es',
        })
      ).rejects.toThrow('https://developers.deepl.com/docs/api-reference/document');

      expect(mockClient.uploadDocument).not.toHaveBeenCalled();
    });
  });

  describe('getSupportedFileTypes', () => {
    it('should return list of supported document file types', () => {
      const supportedTypes = service.getSupportedFileTypes();

      expect(supportedTypes).toContain('.pdf');
      expect(supportedTypes).toContain('.docx');
      expect(supportedTypes).toContain('.pptx');
      expect(supportedTypes).toContain('.xlsx');
      expect(supportedTypes).toContain('.txt');
      expect(supportedTypes).toContain('.html');
      expect(supportedTypes).toContain('.jpg');
      expect(supportedTypes).toContain('.jpeg');
      expect(supportedTypes).toContain('.png');
    });
  });

  describe('isDocumentSupported', () => {
    it('should return true for supported file types', () => {
      expect(service.isDocumentSupported('/test/file.pdf')).toBe(true);
      expect(service.isDocumentSupported('/test/file.docx')).toBe(true);
      expect(service.isDocumentSupported('/test/file.pptx')).toBe(true);
      expect(service.isDocumentSupported('/test/file.xlsx')).toBe(true);
      expect(service.isDocumentSupported('/test/file.txt')).toBe(true);
      expect(service.isDocumentSupported('/test/file.html')).toBe(true);
    });

    it('should return true for image file types', () => {
      expect(service.isDocumentSupported('/test/file.jpg')).toBe(true);
      expect(service.isDocumentSupported('/test/file.jpeg')).toBe(true);
      expect(service.isDocumentSupported('/test/file.png')).toBe(true);
    });

    it('should return false for unsupported file types', () => {
      expect(service.isDocumentSupported('/test/file.mp4')).toBe(false);
      expect(service.isDocumentSupported('/test/file.gif')).toBe(false);
      expect(service.isDocumentSupported('/test/file.unknown')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(service.isDocumentSupported('/test/FILE.PDF')).toBe(true);
      expect(service.isDocumentSupported('/test/document.DOCX')).toBe(true);
    });
  });

  describe('cancellation support', () => {
    it('should cancel translation when AbortSignal is aborted before polling starts', async () => {
      const inputPath = '/test/doc.pdf';
      const outputPath = '/test/doc.es.pdf';
      const fileBuffer = Buffer.from('content');

      mockReadFileSync.mockReturnValue(fileBuffer);

      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      // Create an already-aborted signal
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        service.translateDocument(
          inputPath,
          outputPath,
          { targetLang: 'es' },
          undefined,
          { abortSignal: abortController.signal }
        )
      ).rejects.toThrow('Document translation cancelled');

      // Should have uploaded but not polled
      expect(mockClient.uploadDocument).toHaveBeenCalled();
      expect(mockClient.getDocumentStatus).not.toHaveBeenCalled();
    });

    it('should cancel translation during polling', async () => {
      const inputPath = '/test/doc.pdf';
      const outputPath = '/test/doc.es.pdf';
      const fileBuffer = Buffer.from('content');

      mockReadFileSync.mockReturnValue(fileBuffer);

      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      const abortController = new AbortController();

      // Mock getDocumentStatus to return "translating" and then abort after first call
      mockClient.getDocumentStatus = jest.fn()
        .mockImplementation(() => {
          // Abort after first status check
          abortController.abort();
          return Promise.resolve({
            documentId: 'doc-123',
            status: 'translating',
            secondsRemaining: 10,
          });
        });

      await expect(
        service.translateDocument(
          inputPath,
          outputPath,
          { targetLang: 'es' },
          undefined,
          { abortSignal: abortController.signal }
        )
      ).rejects.toThrow('Document translation cancelled');

      // Should have polled at least once before cancellation
      expect(mockClient.getDocumentStatus).toHaveBeenCalledWith({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });
    });

    it('should cancel translation during sleep between polls', async () => {
      const inputPath = '/test/doc.pdf';
      const outputPath = '/test/doc.es.pdf';
      const fileBuffer = Buffer.from('content');

      mockReadFileSync.mockReturnValue(fileBuffer);

      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      const abortController = new AbortController();

      // Mock getDocumentStatus to return "translating" status
      mockClient.getDocumentStatus = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        status: 'translating',
        secondsRemaining: 10,
      });

      // Abort after a short delay (during sleep)
      setTimeout(() => {
        abortController.abort();
      }, 50);

      await expect(
        service.translateDocument(
          inputPath,
          outputPath,
          { targetLang: 'es' },
          undefined,
          { abortSignal: abortController.signal }
        )
      ).rejects.toThrow('Document translation cancelled');

      // Should have polled at least once
      expect(mockClient.getDocumentStatus).toHaveBeenCalled();
    });

    it('should complete successfully if not cancelled', async () => {
      const inputPath = '/test/doc.pdf';
      const outputPath = '/test/doc.es.pdf';
      const fileBuffer = Buffer.from('content');
      const translatedBuffer = Buffer.from('translated');

      mockReadFileSync.mockReturnValue(fileBuffer);

      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      mockClient.getDocumentStatus = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        status: 'done',
        billedCharacters: 100,
      });

      mockClient.downloadDocument = jest.fn().mockResolvedValue(translatedBuffer);

      // Create AbortController but don't abort
      const abortController = new AbortController();

      const result = await service.translateDocument(
        inputPath,
        outputPath,
        { targetLang: 'es' },
        undefined,
        { abortSignal: abortController.signal }
      );

      expect(result).toEqual({
        success: true,
        billedCharacters: 100,
        outputPath: outputPath,
      });

      expect(mockClient.downloadDocument).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalledWith(outputPath, translatedBuffer);
    });

    it('should work without AbortSignal (backward compatibility)', async () => {
      const inputPath = '/test/doc.pdf';
      const outputPath = '/test/doc.es.pdf';
      const fileBuffer = Buffer.from('content');
      const translatedBuffer = Buffer.from('translated');

      mockReadFileSync.mockReturnValue(fileBuffer);

      mockClient.uploadDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        documentKey: 'key-456',
      });

      mockClient.getDocumentStatus = jest.fn().mockResolvedValue({
        documentId: 'doc-123',
        status: 'done',
      });

      mockClient.downloadDocument = jest.fn().mockResolvedValue(translatedBuffer);

      // Call without serviceOptions (no AbortSignal)
      const result = await service.translateDocument(
        inputPath,
        outputPath,
        { targetLang: 'es' }
      );

      expect(result).toEqual({
        success: true,
        billedCharacters: undefined,
        outputPath: outputPath,
      });

      expect(mockClient.downloadDocument).toHaveBeenCalled();
    });
  });
});
