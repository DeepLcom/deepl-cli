/**
 * Admin Command
 * Handles admin API operations: key management and usage analytics
 */

import { DeepLClient } from '../../api/deepl-client.js';
import { AdminApiKey, AdminUsageEntry, AdminUsageOptions } from '../../types/index.js';

export class AdminCommand {
  private client: DeepLClient;

  constructor(client: DeepLClient) {
    this.client = client;
  }

  async listKeys(): Promise<AdminApiKey[]> {
    return this.client.listApiKeys();
  }

  async createKey(label?: string): Promise<AdminApiKey> {
    return this.client.createApiKey(label);
  }

  async deactivateKey(keyId: string): Promise<void> {
    return this.client.deactivateApiKey(keyId);
  }

  async renameKey(keyId: string, label: string): Promise<void> {
    return this.client.renameApiKey(keyId, label);
  }

  async setKeyLimit(keyId: string, characters: number | null): Promise<void> {
    return this.client.setApiKeyLimit(keyId, characters);
  }

  async getUsage(options: AdminUsageOptions): Promise<AdminUsageEntry[]> {
    return this.client.getAdminUsage(options);
  }

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
      lines.push('');
    }

    return lines.join('\n').trimEnd();
  }

  formatKeyInfo(key: AdminApiKey): string {
    const lines: string[] = [];
    const status = key.isDeactivated ? 'deactivated' : 'active';
    lines.push(`Key: ${key.label || '(no label)'}`);
    lines.push(`  ID:      ${key.keyId}`);
    lines.push(`  Status:  ${status}`);
    lines.push(`  Created: ${key.creationTime}`);
    if (key.usageLimits?.characters !== undefined) {
      const limit = key.usageLimits.characters === null
        ? 'unlimited'
        : key.usageLimits.characters.toLocaleString();
      lines.push(`  Limit:   ${limit} characters`);
    }
    return lines.join('\n');
  }

  formatUsage(entries: AdminUsageEntry[]): string {
    if (entries.length === 0) {
      return 'No usage data found for the specified period.';
    }

    const lines: string[] = [];
    lines.push(`Usage data (${entries.length} entries):\n`);

    for (const entry of entries) {
      const parts: string[] = [];
      if (entry.keyId) parts.push(`Key: ${entry.keyId}`);
      if (entry.date) parts.push(`Date: ${entry.date}`);
      parts.push(`Translated: ${entry.charactersTranslated.toLocaleString()}`);
      parts.push(`Billed: ${entry.charactersBilled.toLocaleString()}`);
      lines.push(`  ${parts.join(' | ')}`);
    }

    return lines.join('\n');
  }

  formatJson(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }
}
