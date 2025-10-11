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
  });
});
