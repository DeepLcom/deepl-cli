/**
 * Document Translation Service
 * Handles translation of binary documents (PDF, DOCX, etc.) with polling
 */

import * as fs from 'fs';
import * as path from 'path';
import { DeepLClient } from '../api/deepl-client.js';
import {
  DocumentTranslationOptions,
  DocumentHandle,
  DocumentStatus,
} from '../types/index.js';

interface DocumentTranslationResult {
  success: boolean;
  billedCharacters?: number;
  outputPath: string;
  errorMessage?: string;
}

interface DocumentProgressUpdate {
  status: 'queued' | 'translating' | 'done' | 'error';
  secondsRemaining?: number;
  billedCharacters?: number;
  errorMessage?: string;
}

type ProgressCallback = (progress: DocumentProgressUpdate) => void;

export class DocumentTranslationService {
  private client: DeepLClient;
  private supportedExtensions = [
    '.pdf',
    '.docx',
    '.doc',
    '.pptx',
    '.xlsx',
    '.txt',
    '.html',
    '.htm',
    '.xlf',
    '.xliff',
    '.srt',
  ];

  // Polling configuration
  private readonly INITIAL_POLL_INTERVAL = 1000; // 1 second
  private readonly MAX_POLL_INTERVAL = 30000; // 30 seconds
  private readonly BACKOFF_MULTIPLIER = 1.5;

  constructor(client: DeepLClient) {
    this.client = client;
  }

  /**
   * Translate a document from input path to output path
   */
  async translateDocument(
    inputPath: string,
    outputPath: string,
    options: DocumentTranslationOptions,
    progressCallback?: ProgressCallback
  ): Promise<DocumentTranslationResult> {
    // Validate input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Read input file
    const fileBuffer = fs.readFileSync(inputPath);
    const filename = path.basename(inputPath);

    // Upload document
    const handle = await this.client.uploadDocument(fileBuffer, {
      ...options,
      filename,
    });

    // Poll for completion
    const finalStatus = await this.pollDocumentStatus(handle, progressCallback);

    // Check for errors
    if (finalStatus.status === 'error') {
      throw new Error(
        `Document translation failed: ${finalStatus.errorMessage || 'Unknown error'}`
      );
    }

    // Download translated document
    const translatedBuffer = await this.client.downloadDocument(handle);

    // Create output directory if needed
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write translated document to output path
    fs.writeFileSync(outputPath, translatedBuffer);

    return {
      success: true,
      billedCharacters: finalStatus.billedCharacters,
      outputPath,
    };
  }

  /**
   * Poll document status until translation is complete
   */
  private async pollDocumentStatus(
    handle: DocumentHandle,
    progressCallback?: ProgressCallback
  ): Promise<DocumentStatus> {
    let pollInterval = this.INITIAL_POLL_INTERVAL;
    let status: DocumentStatus;

    while (true) {
      status = await this.client.getDocumentStatus(handle);

      // Call progress callback if provided
      if (progressCallback) {
        progressCallback({
          status: status.status,
          secondsRemaining: status.secondsRemaining,
          billedCharacters: status.billedCharacters,
          errorMessage: status.errorMessage,
        });
      }

      // Check if translation is complete
      if (status.status === 'done' || status.status === 'error') {
        break;
      }

      // Wait before next poll with exponential backoff
      await this.sleep(pollInterval);
      pollInterval = Math.min(
        pollInterval * this.BACKOFF_MULTIPLIER,
        this.MAX_POLL_INTERVAL
      );
    }

    return status;
  }

  /**
   * Get list of supported document file types
   */
  getSupportedFileTypes(): string[] {
    return [...this.supportedExtensions];
  }

  /**
   * Check if a file type is supported for document translation
   */
  isDocumentSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  /**
   * Sleep helper for polling delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
