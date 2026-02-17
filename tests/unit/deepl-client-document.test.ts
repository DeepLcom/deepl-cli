/**
 * DeepL Client Document Translation Tests
 * Tests for document upload, status checking, and download
 */

import { DeepLClient } from '../../src/api/deepl-client.js';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DeepLClient - Document Translation', () => {
  let client: DeepLClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Create mock axios instance
    mockAxiosInstance = {
      request: jest.fn(),
      post: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };

    // Mock axios.create to return our mock instance
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(false);

    // Create client after mocking
    client = new DeepLClient('test-api-key');
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('uploadDocument', () => {
    it('should upload a document and return document handle', async () => {
      const mockResponse = {
        data: {
          document_id: 'abc123-document-id',
          document_key: 'xyz789-document-key',
        },
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const fileBuffer = Buffer.from('test file content');
      const result = await client.uploadDocument(fileBuffer, {
        targetLang: 'es',
        filename: 'test.pdf',
      });

      expect(result).toEqual({
        documentId: 'abc123-document-id',
        documentKey: 'xyz789-document-key',
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/v2/document',
        })
      );
    });

    it('should include source language if specified', async () => {
      const mockResponse = {
        data: {
          document_id: 'doc-id',
          document_key: 'doc-key',
        },
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const fileBuffer = Buffer.from('test content');
      await client.uploadDocument(fileBuffer, {
        sourceLang: 'en',
        targetLang: 'fr',
        filename: 'document.docx',
      });

      expect(mockAxiosInstance.request).toHaveBeenCalled();
    });

    it('should include formality if specified', async () => {
      const mockResponse = {
        data: {
          document_id: 'doc-id',
          document_key: 'doc-key',
        },
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const fileBuffer = Buffer.from('test content');
      await client.uploadDocument(fileBuffer, {
        targetLang: 'de',
        filename: 'document.pdf',
        formality: 'more',
      });

      expect(mockAxiosInstance.request).toHaveBeenCalled();
    });

    it('should include glossary ID if specified', async () => {
      const mockResponse = {
        data: {
          document_id: 'doc-id',
          document_key: 'doc-key',
        },
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const fileBuffer = Buffer.from('test content');
      await client.uploadDocument(fileBuffer, {
        targetLang: 'es',
        filename: 'file.txt',
        glossaryId: 'glossary-123',
      });

      expect(mockAxiosInstance.request).toHaveBeenCalled();
    });

    it('should include enable_document_minification parameter when enabled', async () => {
      const mockResponse = {
        data: {
          document_id: 'doc-id',
          document_key: 'doc-key',
        },
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const fileBuffer = Buffer.from('test content');
      await client.uploadDocument(fileBuffer, {
        targetLang: 'es',
        filename: 'presentation.pptx',
        enableDocumentMinification: true,
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/v2/document',
        })
      );

      // Verify the form data contains enable_document_minification
      const callArgs = mockAxiosInstance.request.mock.calls[0][0];
      expect(callArgs.data).toBeDefined();
    });

    it('should NOT include enable_document_minification parameter when not specified', async () => {
      const mockResponse = {
        data: {
          document_id: 'doc-id',
          document_key: 'doc-key',
        },
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const fileBuffer = Buffer.from('test content');
      await client.uploadDocument(fileBuffer, {
        targetLang: 'es',
        filename: 'document.docx',
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/v2/document',
        })
      );
    });

    it('should include enable_beta_languages parameter when enabled', async () => {
      const mockResponse = {
        data: {
          document_id: 'doc-id',
          document_key: 'doc-key',
        },
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const fileBuffer = Buffer.from('test content');
      await client.uploadDocument(fileBuffer, {
        targetLang: 'es',
        filename: 'document.pdf',
        enableBetaLanguages: true,
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/v2/document',
        })
      );

      const callArgs = mockAxiosInstance.request.mock.calls[0][0];
      expect(callArgs.data).toBeDefined();
    });

    it('should NOT include enable_beta_languages parameter when not specified', async () => {
      const mockResponse = {
        data: {
          document_id: 'doc-id',
          document_key: 'doc-key',
        },
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const fileBuffer = Buffer.from('test content');
      await client.uploadDocument(fileBuffer, {
        targetLang: 'es',
        filename: 'document.docx',
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/v2/document',
        })
      );
    });

    it('should throw error if filename is missing', async () => {
      const fileBuffer = Buffer.from('test content');

      await expect(
        client.uploadDocument(fileBuffer, {
          targetLang: 'es',
          // filename missing
        } as any)
      ).rejects.toThrow('filename is required when uploading document as Buffer');
    });

    it('should throw error if file is empty', async () => {
      const emptyBuffer = Buffer.from('');

      await expect(
        client.uploadDocument(emptyBuffer, {
          targetLang: 'es',
          filename: 'empty.pdf',
        })
      ).rejects.toThrow('Document file cannot be empty');
    });

    it('should handle 403 authentication error', async () => {
      const mockError = {
        response: {
          status: 403,
          data: { message: 'Invalid API key' },
        },
        isAxiosError: true,
      };
      mockAxiosInstance.request.mockRejectedValue(mockError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const fileBuffer = Buffer.from('test');

      await expect(
        client.uploadDocument(fileBuffer, {
          targetLang: 'es',
          filename: 'test.pdf',
        })
      ).rejects.toThrow('Authentication failed: Invalid API key');
    });

    it('should handle 456 quota exceeded error', async () => {
      const mockError = {
        response: {
          status: 456,
          data: {},
        },
        isAxiosError: true,
      };
      mockAxiosInstance.request.mockRejectedValue(mockError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const fileBuffer = Buffer.from('test');

      await expect(
        client.uploadDocument(fileBuffer, {
          targetLang: 'es',
          filename: 'test.pdf',
        })
      ).rejects.toThrow('Quota exceeded: Character limit reached');
    });
  });

  describe('getDocumentStatus', () => {
    it('should return queued status', async () => {
      const mockResponse = {
        data: {
          document_id: 'doc-id',
          status: 'queued',
        },
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await client.getDocumentStatus({
        documentId: 'doc-id',
        documentKey: 'doc-key',
      });

      expect(result).toEqual({
        documentId: 'doc-id',
        status: 'queued',
        secondsRemaining: undefined,
        billedCharacters: undefined,
        errorMessage: undefined,
      });
    });

    it('should return translating status with seconds remaining', async () => {
      const mockResponse = {
        data: {
          document_id: 'doc-id',
          status: 'translating',
          seconds_remaining: 30,
        },
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await client.getDocumentStatus({
        documentId: 'doc-id',
        documentKey: 'doc-key',
      });

      expect(result).toEqual({
        documentId: 'doc-id',
        status: 'translating',
        secondsRemaining: 30,
        billedCharacters: undefined,
        errorMessage: undefined,
      });
    });

    it('should return done status with billed characters', async () => {
      const mockResponse = {
        data: {
          document_id: 'doc-id',
          status: 'done',
          billed_characters: 1500,
        },
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await client.getDocumentStatus({
        documentId: 'doc-id',
        documentKey: 'doc-key',
      });

      expect(result).toEqual({
        documentId: 'doc-id',
        status: 'done',
        secondsRemaining: undefined,
        billedCharacters: 1500,
        errorMessage: undefined,
      });
    });

    it('should return error status with error message', async () => {
      const mockResponse = {
        data: {
          document_id: 'doc-id',
          status: 'error',
          error_message: 'Invalid file format',
        },
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await client.getDocumentStatus({
        documentId: 'doc-id',
        documentKey: 'doc-key',
      });

      expect(result).toEqual({
        documentId: 'doc-id',
        status: 'error',
        secondsRemaining: undefined,
        billedCharacters: undefined,
        errorMessage: 'Invalid file format',
      });
    });

    it('should use document key in request', async () => {
      const mockResponse = {
        data: {
          document_id: 'doc-id',
          status: 'queued',
        },
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      await client.getDocumentStatus({
        documentId: 'my-doc-id',
        documentKey: 'my-doc-key',
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/v2/document/my-doc-id',
        })
      );
    });
  });

  describe('downloadDocument', () => {
    it('should download translated document', async () => {
      const mockDocumentData = Buffer.from('translated document content');
      const mockResponse = {
        data: mockDocumentData,
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await client.downloadDocument({
        documentId: 'doc-id',
        documentKey: 'doc-key',
      });

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/v2/document/doc-id/result',
          responseType: 'arraybuffer',
        })
      );
    });

    it('should include document key in download request', async () => {
      const mockResponse = {
        data: Buffer.from('content'),
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      await client.downloadDocument({
        documentId: 'my-doc',
        documentKey: 'my-key',
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/v2/document/my-doc/result',
        })
      );
    });

    it('should handle download error when document not ready', async () => {
      const mockError = {
        response: {
          status: 503,
          data: { message: 'Document translation not complete' },
        },
        isAxiosError: true,
      };
      mockAxiosInstance.request.mockRejectedValue(mockError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(
        client.downloadDocument({
          documentId: 'doc-id',
          documentKey: 'doc-key',
        })
      ).rejects.toThrow('Service temporarily unavailable');
    });
  });
});
