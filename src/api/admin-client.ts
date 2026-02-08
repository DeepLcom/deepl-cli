import { HttpClient, DeepLClientOptions } from './http-client.js';
import { AdminApiKey, AdminUsageOptions, AdminUsageReport, UsageBreakdown } from '../types';

export class AdminClient extends HttpClient {
  constructor(apiKey: string, options: DeepLClientOptions = {}) {
    super(apiKey, options);
  }

  async listApiKeys(): Promise<AdminApiKey[]> {
    try {
      const response = await this.makeJsonRequest<Array<{
        key_id: string;
        label: string;
        creation_time: string;
        is_deactivated: boolean;
        usage_limits?: { characters?: number | null };
      }>>('GET', '/v2/admin/developer-keys');

      return response.map((key) => this.normalizeApiKey(key));
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async createApiKey(label?: string): Promise<AdminApiKey> {
    try {
      const body: Record<string, string> = {};
      if (label) {
        body['label'] = label;
      }

      const response = await this.makeJsonRequest<{
        key_id: string;
        key?: string;
        label: string;
        creation_time: string;
        is_deactivated: boolean;
        usage_limits?: { characters?: number | null };
      }>('POST', '/v2/admin/developer-keys', body);

      return this.normalizeApiKey(response);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async deactivateApiKey(keyId: string): Promise<void> {
    try {
      await this.makeJsonRequest<void>(
        'PUT', '/v2/admin/developer-keys/deactivate', { key_id: keyId }
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async renameApiKey(keyId: string, label: string): Promise<void> {
    try {
      await this.makeJsonRequest<void>(
        'PUT', '/v2/admin/developer-keys/label', { key_id: keyId, label }
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async setApiKeyLimit(keyId: string, characters: number | null): Promise<void> {
    try {
      await this.makeJsonRequest<void>(
        'PUT', '/v2/admin/developer-keys/limits',
        { key_id: keyId, characters } as unknown as Record<string, unknown>
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getAdminUsage(options: AdminUsageOptions): Promise<AdminUsageReport> {
    try {
      const params: Record<string, string> = {
        start_date: options.startDate,
        end_date: options.endDate,
      };

      if (options.groupBy) {
        params['group_by'] = options.groupBy;
      }

      interface RawUsageBreakdown {
        total_characters: number;
        text_translation_characters: number;
        document_translation_characters: number;
        text_improvement_characters: number;
        speech_to_text_milliseconds: number;
      }

      interface RawEntry {
        api_key?: string;
        api_key_label?: string;
        usage_date?: string;
        usage: RawUsageBreakdown;
      }

      const response = await this.makeJsonRequest<{
        usage_report: {
          total_usage: RawUsageBreakdown;
          start_date: string;
          end_date: string;
          group_by?: string;
          key_usages?: RawEntry[];
          key_and_day_usages?: RawEntry[];
        };
      }>('GET', '/v2/admin/analytics', params as unknown as Record<string, unknown>);

      const report = response.usage_report;

      const mapBreakdown = (raw: RawUsageBreakdown): UsageBreakdown => ({
        totalCharacters: raw.total_characters,
        textTranslationCharacters: raw.text_translation_characters,
        documentTranslationCharacters: raw.document_translation_characters,
        textImprovementCharacters: raw.text_improvement_characters,
        speechToTextMilliseconds: raw.speech_to_text_milliseconds,
      });

      const rawEntries = report.key_usages ?? report.key_and_day_usages ?? [];

      return {
        totalUsage: mapBreakdown(report.total_usage),
        startDate: report.start_date,
        endDate: report.end_date,
        groupBy: report.group_by,
        entries: rawEntries.map((entry) => ({
          apiKey: entry.api_key,
          apiKeyLabel: entry.api_key_label,
          usageDate: entry.usage_date,
          usage: mapBreakdown(entry.usage),
        })),
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private normalizeApiKey(key: {
    key_id: string;
    key?: string;
    label: string;
    creation_time: string;
    is_deactivated: boolean;
    usage_limits?: { characters?: number | null };
  }): AdminApiKey {
    const result: AdminApiKey = {
      keyId: key.key_id,
      label: key.label,
      creationTime: key.creation_time,
      isDeactivated: key.is_deactivated,
      usageLimits: key.usage_limits,
    };
    if (key.key) {
      result.key = key.key;
    }
    return result;
  }
}
