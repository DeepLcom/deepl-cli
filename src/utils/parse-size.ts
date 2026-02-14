/**
 * Parse Size Utility
 * Converts human-readable size strings to bytes
 */

import { ValidationError } from './errors.js';

/**
 * Parse human-readable size string to bytes
 * Supports: bytes, KB, MB, GB, K, M, G
 *
 * Examples:
 *   parseSize('100') => 100 (bytes)
 *   parseSize('100K') => 102400
 *   parseSize('100KB') => 102400
 *   parseSize('1M') => 1048576
 *   parseSize('1MB') => 1048576
 *   parseSize('2G') => 2147483648
 *   parseSize('2GB') => 2147483648
 */
export function parseSize(size: string): number {
  if (!size || size.trim() === '') {
    throw new ValidationError('Size cannot be empty');
  }

  const trimmed = size.trim().toUpperCase();

  // Check if it's a plain number (bytes)
  const plainNumber = parseInt(trimmed, 10);
  if (!isNaN(plainNumber) && trimmed === plainNumber.toString()) {
    if (plainNumber < 0) {
      throw new ValidationError('Size must be positive');
    }
    return plainNumber;
  }

  // Parse size with unit
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([KMGT]B?)$/);

  if (!match) {
    throw new ValidationError(`Invalid size format: ${size}. Use formats like: 100, 100K, 100MB, 1G`);
  }

  const value = parseFloat(match[1]!);
  const unit = match[2]!;

  if (value < 0) {
    throw new ValidationError('Size must be positive');
  }

  // Convert to bytes based on unit
  const multipliers: Record<string, number> = {
    'K': 1024,
    'KB': 1024,
    'M': 1024 * 1024,
    'MB': 1024 * 1024,
    'G': 1024 * 1024 * 1024,
    'GB': 1024 * 1024 * 1024,
    'T': 1024 * 1024 * 1024 * 1024,
    'TB': 1024 * 1024 * 1024 * 1024,
  };

  const multiplier = multipliers[unit];
  if (!multiplier) {
    throw new ValidationError(`Unknown size unit: ${unit}`);
  }

  return Math.floor(value * multiplier);
}

/**
 * Format bytes to human-readable string
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
