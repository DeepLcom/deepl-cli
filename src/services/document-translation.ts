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

interface TranslateDocumentOptions {
  abortSignal?: AbortSignal;
}

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
    '.jpg',
    '.jpeg',
    '.png',
  ];

  // Polling configuration
  private readonly INITIAL_POLL_INTERVAL = 1000; // 1 second
  private readonly MAX_POLL_INTERVAL = 30000; // 30 seconds
  private readonly BACKOFF_MULTIPLIER = 1.5;
  private readonly MAX_POLL_ATTEMPTS = 180; // 90 minutes with 30s max interval
  private readonly TOTAL_TIMEOUT_MS = 90 * 60 * 1000; // 90 minutes total

  constructor(client: DeepLClient) {
    this.client = client;
  }

  /**
   * Translate a document from input path to output path
   * Can be cancelled via options.abortSignal
   */
  async translateDocument(
    inputPath: string,
    outputPath: string,
    options: DocumentTranslationOptions,
    progressCallback?: ProgressCallback,
    serviceOptions?: TranslateDocumentOptions
  ): Promise<DocumentTranslationResult> {
    // Validate input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Validate document minification is only used with PPTX/DOCX
    if (options.enableDocumentMinification) {
      const ext = path.extname(inputPath).toLowerCase();
      if (ext !== '.pptx' && ext !== '.docx') {
        throw new Error(
          'Document minification is only supported for PPTX and DOCX files'
        );
      }
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
    const finalStatus = await this.pollDocumentStatus(
      handle,
      progressCallback,
      serviceOptions?.abortSignal
    );

    // Check for errors
    if (finalStatus.status === 'error') {
      throw new Error(
        `Document translation failed: ${finalStatus.errorMessage ?? 'Unknown error'}`
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
   * Can be cancelled via abortSignal
   * Has maximum retry attempts and total timeout to prevent infinite loops
   */
  private async pollDocumentStatus(
    handle: DocumentHandle,
    progressCallback?: ProgressCallback,
    abortSignal?: AbortSignal
  ): Promise<DocumentStatus> {
    let pollInterval = this.INITIAL_POLL_INTERVAL;
    let attempts = 0;
    const startTime = Date.now();
    let status: DocumentStatus;

    while (attempts < this.MAX_POLL_ATTEMPTS) {
      attempts++;

      // Check if total timeout exceeded
      const elapsed = Date.now() - startTime;
      if (elapsed > this.TOTAL_TIMEOUT_MS) {
        throw new Error(
          `Document translation timeout exceeded (${this.TOTAL_TIMEOUT_MS / 1000 / 60} minutes). The document may still be processing on DeepL servers.`
        );
      }

      // Check if operation was cancelled
      if (abortSignal?.aborted) {
        throw new Error('Document translation cancelled');
      }

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
        return status;
      }

      await this.sleep(pollInterval, abortSignal);

      if (abortSignal?.aborted) {
        throw new Error('Document translation cancelled');
      }

      pollInterval = Math.min(
        pollInterval * this.BACKOFF_MULTIPLIER,
        this.MAX_POLL_INTERVAL
      );
    }

    // Exceeded maximum attempts
    const totalElapsed = Date.now() - startTime;
    throw new Error(
      `Document translation exceeded maximum polling attempts (${this.MAX_POLL_ATTEMPTS} attempts over ${(totalElapsed / 1000 / 60).toFixed(1)} minutes). The document may still be processing on DeepL servers.`
    );
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
   * Can be cancelled via abortSignal
   */
  private sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already aborted
      if (abortSignal?.aborted) {
        reject(new Error('Document translation cancelled'));
        return;
      }

      let isSettled = false;

      const timeout = setTimeout(() => {
        isSettled = true;
        if (abortSignal) {
          abortSignal.removeEventListener('abort', abortHandler);
        }
        resolve();
      }, ms);

      // Listen for abort event
      const abortHandler = () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timeout);
          reject(new Error('Document translation cancelled'));
        }
      };

      abortSignal?.addEventListener('abort', abortHandler, { once: true });
    });
  }
}
