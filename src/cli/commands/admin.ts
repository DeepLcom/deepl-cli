/**
 * Admin Command
 * Handles admin API operations: key management and usage analytics
 */

import type { AdminService } from '../../services/admin.js';
import { AdminApiKey, AdminUsageOptions, AdminUsageReport, UsageBreakdown } from '../../types/index.js';

/**
 * Manages DeepL admin API operations for team accounts.
 * Requires an admin API key with elevated permissions.
 */
export class AdminCommand {
  private service: AdminService;

  constructor(service: AdminService) {
    this.service = service;
  }

  /** List all API keys in the team account. */
  async listKeys(): Promise<AdminApiKey[]> {
    return this.service.listApiKeys();
  }

  /** Create a new API key with an optional human-readable label. */
  async createKey(label?: string): Promise<AdminApiKey> {
    return this.service.createApiKey(label);
  }

  /** Permanently deactivate an API key. This cannot be undone. */
  async deactivateKey(keyId: string): Promise<void> {
    return this.service.deactivateApiKey(keyId);
  }

  /** Rename an existing API key. */
  async renameKey(keyId: string, label: string): Promise<void> {
    return this.service.renameApiKey(keyId, label);
  }

  /**
   * Set the character usage limit for an API key.
   * @param characters - Maximum characters allowed, or null for unlimited.
   * @param sttLimit - Optional speech-to-text milliseconds limit.
   */
  async setKeyLimit(keyId: string, characters: number | null, sttLimit?: number | null): Promise<void> {
    return this.service.setApiKeyLimit(keyId, characters, sttLimit);
  }

  /**
   * Retrieve usage analytics for the team account.
   * Uses the /v2/admin/analytics endpoint with per-product breakdowns.
   */
  async getUsage(options: AdminUsageOptions): Promise<AdminUsageReport> {
    return this.service.getAdminUsage(options);
  }

  /** Format a list of API keys for human-readable terminal output. */
  formatKeyList(keys: AdminApiKey[]): string {
    if (keys.length === 0) {
      return 'No API keys found.';
    }

    const lines: string[] = [];
    lines.push(`Found ${keys.length} API key(s):\n`);

    for (const key of keys) {
      const status = key.isDeactivated ? '(deactivated)' : '(active)';
      lines.push(`  ${key.label || '(no label)'} ${status}`);
      lines.push(`    ID:      ${key.keyId}`);
      lines.push(`    Created: ${key.creationTime}`);
      if (key.usageLimits?.characters !== undefined) {
        const limit = key.usageLimits.characters === null
          ? 'unlimited'
          : key.usageLimits.characters.toLocaleString();
        lines.push(`    Limit:   ${limit} characters`);
      }
      if (key.usageLimits?.speechToTextMilliseconds !== undefined) {
        const sttLimit = key.usageLimits.speechToTextMilliseconds === null
          ? 'unlimited'
          : this.formatMilliseconds(key.usageLimits.speechToTextMilliseconds);
        lines.push(`    STT Limit: ${sttLimit}`);
      }
      lines.push('');
    }

    return lines.join('\n').trimEnd();
  }

  /** Format a single API key's details for terminal output. */
  formatKeyInfo(key: AdminApiKey): string {
    const lines: string[] = [];
    const status = key.isDeactivated ? 'deactivated' : 'active';
    lines.push(`Key: ${key.label || '(no label)'}`);
    lines.push(`  ID:      ${key.keyId}`);
    if (key.key) {
      lines.push(`  Secret:  ${key.key}`);
    }
    lines.push(`  Status:  ${status}`);
    lines.push(`  Created: ${key.creationTime}`);
    if (key.usageLimits?.characters !== undefined) {
      const limit = key.usageLimits.characters === null
        ? 'unlimited'
        : key.usageLimits.characters.toLocaleString();
      lines.push(`  Limit:   ${limit} characters`);
    }
    if (key.usageLimits?.speechToTextMilliseconds !== undefined) {
      const sttLimit = key.usageLimits.speechToTextMilliseconds === null
        ? 'unlimited'
        : this.formatMilliseconds(key.usageLimits.speechToTextMilliseconds);
      lines.push(`  STT Limit: ${sttLimit}`);
    }
    return lines.join('\n');
  }

  /** Format a per-product usage breakdown (translation, documents, write, voice). */
  private formatBreakdown(usage: UsageBreakdown, indent = '  '): string[] {
    const lines: string[] = [];
    lines.push(`${indent}Total:       ${usage.totalCharacters.toLocaleString()}`);
    lines.push(`${indent}Translation: ${usage.textTranslationCharacters.toLocaleString()}`);
    lines.push(`${indent}Documents:   ${usage.documentTranslationCharacters.toLocaleString()}`);
    lines.push(`${indent}Write:       ${usage.textImprovementCharacters.toLocaleString()}`);
    lines.push(`${indent}Voice:       ${this.formatMilliseconds(usage.speechToTextMilliseconds)}`);
    return lines;
  }

  private formatMilliseconds(ms: number): string {
    if (ms === 0) {
      return '0ms';
    }
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s ${ms % 1000}ms`;
  }

  /** Format a full usage report with totals and optional per-key entries. */
  formatUsage(report: AdminUsageReport): string {
    const lines: string[] = [];
    lines.push(`Period: ${report.startDate} to ${report.endDate}\n`);
    lines.push('Total Usage:');
    lines.push(...this.formatBreakdown(report.totalUsage));

    if (report.entries.length > 0) {
      lines.push('');
      lines.push(`Per-Key Usage (${report.entries.length} entries):\n`);

      for (const entry of report.entries) {
        const label = entry.apiKeyLabel ?? entry.apiKey ?? 'unknown';
        const datePart = entry.usageDate ? ` (${entry.usageDate})` : '';
        lines.push(`  ${label}${datePart}`);
        lines.push(...this.formatBreakdown(entry.usage, '    '));
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /** Serialize any admin API response as pretty-printed JSON. */
  formatJson(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }
}
