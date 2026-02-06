/**
 * Tests for Usage Command
 * Following TDD approach
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { UsageCommand } from '../../src/cli/commands/usage';
import { DeepLClient } from '../../src/api/deepl-client';

// Mock dependencies
jest.mock('../../src/api/deepl-client');

// Mock chalk to avoid ESM issues in tests
jest.mock('chalk', () => {
  const mockChalk = {
    bold: (text: string) => text,
    green: (text: string) => text,
    yellow: (text: string) => text,
    red: (text: string) => text,
    blue: (text: string) => text,
    gray: (text: string) => text,
  };
  return {
    __esModule: true,
    default: mockChalk,
  };
});

describe('UsageCommand', () => {
  let mockDeepLClient: jest.Mocked<DeepLClient>;
  let usageCommand: UsageCommand;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDeepLClient = {
      getUsage: jest.fn().mockResolvedValue({
        characterCount: 123456,
        characterLimit: 500000,
      }),
    } as unknown as jest.Mocked<DeepLClient>;

    usageCommand = new UsageCommand(mockDeepLClient);
  });

  describe('getUsage()', () => {
    it('should retrieve usage statistics from DeepL API', async () => {
      const usage = await usageCommand.getUsage();

      expect(mockDeepLClient.getUsage).toHaveBeenCalled();
      expect(usage).toEqual({
        characterCount: 123456,
        characterLimit: 500000,
      });
    });

    it('should calculate usage percentage', async () => {
      const usage = await usageCommand.getUsage();
      const percentage = (usage.characterCount / usage.characterLimit) * 100;

      expect(percentage).toBeCloseTo(24.69, 1);
    });

    it('should handle zero limit gracefully', async () => {
      mockDeepLClient.getUsage = jest.fn().mockResolvedValue({
        characterCount: 0,
        characterLimit: 0,
      });

      const usage = await usageCommand.getUsage();

      expect(usage.characterCount).toBe(0);
      expect(usage.characterLimit).toBe(0);
    });

    it('should handle API errors', async () => {
      mockDeepLClient.getUsage = jest.fn().mockRejectedValue(new Error('API error'));

      await expect(usageCommand.getUsage()).rejects.toThrow('API error');
    });

    it('should handle authentication errors', async () => {
      mockDeepLClient.getUsage = jest.fn().mockRejectedValue(
        new Error('Authentication failed: Invalid API key')
      );

      await expect(usageCommand.getUsage()).rejects.toThrow('Authentication failed: Invalid API key');
    });

    it('should handle quota exceeded errors', async () => {
      mockDeepLClient.getUsage = jest.fn().mockRejectedValue(
        new Error('Quota exceeded: Character limit reached')
      );

      await expect(usageCommand.getUsage()).rejects.toThrow('Quota exceeded: Character limit reached');
    });
  });

  describe('formatUsage()', () => {
    it('should format usage statistics with colors', () => {
      const formatted = usageCommand.formatUsage({
        characterCount: 123456,
        characterLimit: 500000,
      });

      expect(formatted).toContain('Character Usage:');
      expect(formatted).toContain('123,456');
      expect(formatted).toContain('500,000');
      expect(formatted).toContain('24.7%');
    });

    it('should show warning for high usage (>80%)', () => {
      const formatted = usageCommand.formatUsage({
        characterCount: 450000,
        characterLimit: 500000,
      });

      expect(formatted).toContain('90.0%');
      // Should contain warning indicator
    });

    it('should format remaining characters', () => {
      const formatted = usageCommand.formatUsage({
        characterCount: 123456,
        characterLimit: 500000,
      });

      expect(formatted).toContain('Remaining:');
      expect(formatted).toContain('376,544');
    });

    it('should handle zero limit display', () => {
      const formatted = usageCommand.formatUsage({
        characterCount: 0,
        characterLimit: 0,
      });

      expect(formatted).toContain('0');
    });

    it('should display billing period when available', () => {
      const formatted = usageCommand.formatUsage({
        characterCount: 2150000,
        characterLimit: 20000000,
        startTime: '2025-04-24T14:58:02Z',
        endTime: '2025-05-24T14:58:02Z',
      });

      expect(formatted).toContain('Billing Period:');
      expect(formatted).toContain('2025-04-24');
      expect(formatted).toContain('2025-05-24');
    });

    it('should display per-product breakdown when available', () => {
      const formatted = usageCommand.formatUsage({
        characterCount: 2150000,
        characterLimit: 20000000,
        products: [
          { productType: 'translate', characterCount: 900000, apiKeyCharacterCount: 880000 },
          { productType: 'write', characterCount: 1250000, apiKeyCharacterCount: 1000000 },
        ],
      });

      expect(formatted).toContain('Product Breakdown:');
      expect(formatted).toContain('translate');
      expect(formatted).toContain('900,000');
      expect(formatted).toContain('write');
      expect(formatted).toContain('1,250,000');
    });

    it('should display API key-level usage when available', () => {
      const formatted = usageCommand.formatUsage({
        characterCount: 2150000,
        characterLimit: 20000000,
        apiKeyCharacterCount: 1880000,
        apiKeyCharacterLimit: 0,
      });

      expect(formatted).toContain('API Key Usage:');
      expect(formatted).toContain('1,880,000');
    });

    it('should display full Pro response with all fields', () => {
      const formatted = usageCommand.formatUsage({
        characterCount: 2150000,
        characterLimit: 20000000,
        apiKeyCharacterCount: 1880000,
        apiKeyCharacterLimit: 0,
        startTime: '2025-04-24T14:58:02Z',
        endTime: '2025-05-24T14:58:02Z',
        products: [
          { productType: 'translate', characterCount: 900000, apiKeyCharacterCount: 880000 },
          { productType: 'write', characterCount: 1250000, apiKeyCharacterCount: 1000000 },
        ],
      });

      expect(formatted).toContain('Character Usage:');
      expect(formatted).toContain('Billing Period:');
      expect(formatted).toContain('Product Breakdown:');
      expect(formatted).toContain('API Key Usage:');
    });

    it('should omit Pro sections for Free API response', () => {
      const formatted = usageCommand.formatUsage({
        characterCount: 123456,
        characterLimit: 500000,
      });

      expect(formatted).not.toContain('Billing Period:');
      expect(formatted).not.toContain('Product Breakdown:');
      expect(formatted).not.toContain('API Key Usage:');
    });

    it('should show unlimited for zero API key character limit', () => {
      const formatted = usageCommand.formatUsage({
        characterCount: 2150000,
        characterLimit: 20000000,
        apiKeyCharacterCount: 1880000,
        apiKeyCharacterLimit: 0,
      });

      expect(formatted).toContain('unlimited');
    });

    it('should display API key usage with per-product breakdown', () => {
      const formatted = usageCommand.formatUsage({
        characterCount: 2150000,
        characterLimit: 20000000,
        products: [
          { productType: 'translate', characterCount: 900000, apiKeyCharacterCount: 880000 },
        ],
      });

      expect(formatted).toContain('880,000');
    });
  });
});
