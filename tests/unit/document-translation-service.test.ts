/**
 * Document Translation Service Tests
 * Tests for complete document translation workflow with polling
 */

import { DocumentTranslationService } from '../../src/services/document-translation.js';
import { DeepLClient } from '../../src/api/deepl-client.js';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs');
jest.mock('../../src/api/deepl-client.js');

const MockedDeepLClient = DeepLClient as jest.MockedClass<typeof DeepLClient>;
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('DocumentTranslationService', () => {
  let service: DocumentTranslationService;
  let mockClient: jest.Mocked<DeepLClient>;

  beforeEach(() => {
    // Setup default mocks for fs
    (mockedFs.existsSync as jest.Mock) = jest.fn().mockReturnValue(true);
    (mockedFs.readFileSync as jest.Mock) = jest.fn().mockReturnValue(Buffer.from('test'));
    (mockedFs.writeFileSync as jest.Mock) = jest.fn();
    (mockedFs.mkdirSync as jest.Mock) = jest.fn();

    mockClient = new MockedDeepLClient('test-key') as jest.Mocked<DeepLClient>;
    service = new DocumentTranslationService(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('translateDocument', () => {
    it('should upload, poll, and download document successfully', async () => {
      const inputPath = '/test/document.pdf';
      const outputPath = '/test/document.es.pdf';
      const fileBuffer = Buffer.from('test pdf content');
      const translatedBuffer = Buffer.from('translated pdf content');

      // Override fs mocks for this test
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(fileBuffer);

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

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        outputPath,
        translatedBuffer
      );
    });

    it('should throw error if input file does not exist', async () => {
      (mockedFs.existsSync as jest.Mock).mockReturnValue(false);

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

      (mockedFs.readFileSync as jest.Mock).mockReturnValue(fileBuffer);

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

      (mockedFs.readFileSync as jest.Mock).mockReturnValue(fileBuffer);

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

      (mockedFs.readFileSync as jest.Mock).mockReturnValue(fileBuffer);

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
      expect(mockedFs.writeFileSync).toHaveBeenCalled();
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

    it('should return false for unsupported file types', () => {
      expect(service.isDocumentSupported('/test/file.jpg')).toBe(false);
      expect(service.isDocumentSupported('/test/file.png')).toBe(false);
      expect(service.isDocumentSupported('/test/file.mp4')).toBe(false);
      expect(service.isDocumentSupported('/test/file.unknown')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(service.isDocumentSupported('/test/FILE.PDF')).toBe(true);
      expect(service.isDocumentSupported('/test/document.DOCX')).toBe(true);
    });
  });
});
