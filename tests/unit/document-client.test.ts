/**
 * Tests for DocumentClient
 * Covers uploadDocument, getDocumentStatus, downloadDocument
 */

import { DocumentClient } from '../../src/api/document-client.js';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DocumentClient', () => {
  let client: DocumentClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAxiosInstance = {
      request: jest.fn(),
    };

    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(false);

    client = new DocumentClient('test-api-key');
  });

  describe('constructor', () => {
    it('should create a DocumentClient instance', () => {
      expect(client).toBeInstanceOf(DocumentClient);
    });

    it('should throw error for empty API key', () => {
      expect(() => new DocumentClient('')).toThrow('API key is required');
    });

    it('should use Free API URL by default', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api-free.deepl.com',
        }),
      );
    });

    it('should use Pro API URL when usePro is true', () => {
      new DocumentClient('test-key', { usePro: true });
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.deepl.com',
        }),
      );
    });
  });

  describe('uploadDocument()', () => {
    it('should upload a document successfully', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { document_id: 'doc-123', document_key: 'key-abc' },
        status: 200,
        headers: {},
      });

      const file = Buffer.from('test content');
      const result = await client.uploadDocument(file, {
        targetLang: 'de',
        filename: 'test.txt',
      });

      expect(result).toEqual({
        documentId: 'doc-123',
        documentKey: 'key-abc',
      });
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/v2/document',
        }),
      );
    });

    it('should throw ValidationError for empty buffer', async () => {
      const file = Buffer.alloc(0);

      await expect(
        client.uploadDocument(file, { targetLang: 'de', filename: 'test.txt' })
      ).rejects.toThrow('Document file cannot be empty');
    });

    it('should throw ValidationError when filename is missing', async () => {
      const file = Buffer.from('content');

      await expect(
        client.uploadDocument(file, { targetLang: 'de' })
      ).rejects.toThrow('filename is required');
    });

    it('should include optional parameters', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { document_id: 'doc-1', document_key: 'key-1' },
        status: 200,
        headers: {},
      });

      const file = Buffer.from('content');
      await client.uploadDocument(file, {
        targetLang: 'de',
        filename: 'doc.pdf',
        sourceLang: 'en',
        formality: 'more',
        glossaryId: 'g-123',
        outputFormat: 'pdf',
      });

      expect(mockAxiosInstance.request).toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 403, data: { message: 'Forbidden' }, headers: {} },
        message: 'Forbidden',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const file = Buffer.from('content');
      await expect(
        client.uploadDocument(file, { targetLang: 'de', filename: 'test.txt' })
      ).rejects.toThrow();
    });
  });

  describe('getDocumentStatus()', () => {
    it('should return document status', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          document_id: 'doc-123',
          status: 'done',
          seconds_remaining: 0,
          billed_characters: 150,
        },
        status: 200,
        headers: {},
      });

      const result = await client.getDocumentStatus({
        documentId: 'doc-123',
        documentKey: 'key-abc',
      });

      expect(result).toEqual({
        documentId: 'doc-123',
        status: 'done',
        secondsRemaining: 0,
        billedCharacters: 150,
        errorMessage: undefined,
      });
    });

    it('should return translating status with seconds remaining', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          document_id: 'doc-456',
          status: 'translating',
          seconds_remaining: 30,
        },
        status: 200,
        headers: {},
      });

      const result = await client.getDocumentStatus({
        documentId: 'doc-456',
        documentKey: 'key-def',
      });

      expect(result.status).toBe('translating');
      expect(result.secondsRemaining).toBe(30);
    });

    it('should return error status with error message', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          document_id: 'doc-789',
          status: 'error',
          error_message: 'Document too large',
        },
        status: 200,
        headers: {},
      });

      const result = await client.getDocumentStatus({
        documentId: 'doc-789',
        documentKey: 'key-ghi',
      });

      expect(result.status).toBe('error');
      expect(result.errorMessage).toBe('Document too large');
    });

    it('should handle API errors', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 429, data: { message: 'Too many requests' }, headers: {} },
        message: 'Rate limited',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(
        client.getDocumentStatus({ documentId: 'doc-1', documentKey: 'key-1' })
      ).rejects.toThrow();
    });
  });

  describe('downloadDocument()', () => {
    it('should download document as buffer', async () => {
      const docContent = Buffer.from('translated document content');
      mockAxiosInstance.request.mockResolvedValue({
        data: docContent,
        status: 200,
        headers: {},
      });

      const result = await client.downloadDocument({
        documentId: 'doc-123',
        documentKey: 'key-abc',
      });

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/v2/document/doc-123/result',
        }),
      );
    });

    it('should handle API errors during download', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 503, data: { message: 'Service unavailable' }, headers: {} },
        message: 'Unavailable',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(
        client.downloadDocument({ documentId: 'doc-1', documentKey: 'key-1' })
      ).rejects.toThrow();
    });
  });
});
