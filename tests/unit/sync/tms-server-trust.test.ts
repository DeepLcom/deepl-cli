/**
 * Tests for the TMS destination trust gate.
 *
 * The hostile input is `.deepl-sync.yaml` naming `tms.server`; the secret at
 * risk is TMS_API_KEY / TMS_TOKEN from the user's environment.
 */

import {
  ensureTmsServerApproved,
  tmsServerOrigin,
} from '../../../src/sync/tms-server-trust';
import { ConfigError } from '../../../src/utils/errors';
import { setNoInput } from '../../../src/utils/confirm';

interface Harness {
  readAllowedServers: jest.Mock<string[], []>;
  approveServer: jest.Mock<void, [string]>;
  promptForApproval: jest.Mock<Promise<boolean>, [string]>;
  canPrompt: jest.Mock<boolean, []>;
}

function harness(overrides: Partial<Harness> = {}): Harness {
  return {
    readAllowedServers: jest.fn<string[], []>(() => []),
    approveServer: jest.fn<void, [string]>(),
    promptForApproval: jest.fn<Promise<boolean>, [string]>(async () => true),
    canPrompt: jest.fn<boolean, []>(() => true),
    ...overrides,
  };
}

describe('ensureTmsServerApproved', () => {
  describe('credential provenance', () => {
    it('does not gate a credential inlined in the repo YAML (nothing of the user’s leaks)', async () => {
      const deps = harness();
      await expect(
        ensureTmsServerApproved('https://tms.evil.test', 'config', deps)
      ).resolves.toBeUndefined();
      expect(deps.promptForApproval).not.toHaveBeenCalled();
      expect(deps.readAllowedServers).not.toHaveBeenCalled();
    });

    it('does not gate when there is no credential at all', async () => {
      const deps = harness();
      await expect(
        ensureTmsServerApproved('https://tms.evil.test', 'none', deps)
      ).resolves.toBeUndefined();
      expect(deps.promptForApproval).not.toHaveBeenCalled();
    });

    it('gates an env-sourced credential against an unapproved host', async () => {
      const deps = harness({
        canPrompt: jest.fn<boolean, []>(() => false),
      });
      await expect(
        ensureTmsServerApproved('https://tms.evil.test', 'env', deps)
      ).rejects.toThrow(ConfigError);
    });
  });

  describe('allowlist', () => {
    it('approves silently when the hostname is listed', async () => {
      const deps = harness({
        readAllowedServers: jest.fn<string[], []>(() => ['tms.example.com']),
      });
      await expect(
        ensureTmsServerApproved('https://tms.example.com', 'env', deps)
      ).resolves.toBeUndefined();
      expect(deps.promptForApproval).not.toHaveBeenCalled();
      expect(deps.approveServer).not.toHaveBeenCalled();
    });

    it('matches the hostname case-insensitively', async () => {
      const deps = harness({
        readAllowedServers: jest.fn<string[], []>(() => ['TMS.Example.COM']),
      });
      await expect(
        ensureTmsServerApproved('https://tms.example.com', 'env', deps)
      ).resolves.toBeUndefined();
      expect(deps.promptForApproval).not.toHaveBeenCalled();
    });

    it('ignores the port, path, and scheme when matching', async () => {
      const deps = harness({
        readAllowedServers: jest.fn<string[], []>(() => ['tms.example.com']),
      });
      await expect(
        ensureTmsServerApproved(
          'https://tms.example.com:8443/base/path',
          'env',
          deps
        )
      ).resolves.toBeUndefined();
      expect(deps.promptForApproval).not.toHaveBeenCalled();
    });

    it('does not treat a listed host as approving a subdomain of it', async () => {
      const deps = harness({
        readAllowedServers: jest.fn<string[], []>(() => ['example.com']),
        canPrompt: jest.fn<boolean, []>(() => false),
      });
      await expect(
        ensureTmsServerApproved('https://tms.example.com', 'env', deps)
      ).rejects.toThrow(ConfigError);
    });

    it('does not treat a listed host as approving a suffix-matching impostor', async () => {
      const deps = harness({
        readAllowedServers: jest.fn<string[], []>(() => ['tms.example.com']),
        canPrompt: jest.fn<boolean, []>(() => false),
      });
      await expect(
        ensureTmsServerApproved('https://evil-tms.example.com', 'env', deps)
      ).rejects.toThrow(ConfigError);
    });

    it('gates a loopback host too — a co-tenant listener is still an exfiltration sink', async () => {
      const deps = harness({
        canPrompt: jest.fn<boolean, []>(() => false),
      });
      await expect(
        ensureTmsServerApproved('http://127.0.0.1:9999', 'env', deps)
      ).rejects.toThrow(ConfigError);
    });
  });

  describe('trust on first use', () => {
    it('prompts naming the host and what would be sent', async () => {
      const deps = harness();
      await ensureTmsServerApproved('https://tms.evil.test', 'env', deps);
      const message = deps.promptForApproval.mock.calls[0]?.[0] ?? '';
      expect(message).toContain('tms.evil.test');
      expect(message).toMatch(/TMS_API_KEY|credential/i);
      expect(message).toMatch(/translat/i);
    });

    it('records the approval outside the repo when the user accepts', async () => {
      const deps = harness();
      await expect(
        ensureTmsServerApproved('https://tms.evil.test', 'env', deps)
      ).resolves.toBeUndefined();
      expect(deps.approveServer).toHaveBeenCalledWith('tms.evil.test');
    });

    it('records the hostname lowercased, not the full URL', async () => {
      const deps = harness();
      await ensureTmsServerApproved(
        'https://TMS.Example.TEST:8443/x',
        'env',
        deps
      );
      expect(deps.approveServer).toHaveBeenCalledWith('tms.example.test');
    });

    it('fails closed and records nothing when the user declines', async () => {
      const deps = harness({
        promptForApproval: jest.fn<Promise<boolean>, [string]>(
          async () => false
        ),
      });
      await expect(
        ensureTmsServerApproved('https://tms.evil.test', 'env', deps)
      ).rejects.toThrow(ConfigError);
      expect(deps.approveServer).not.toHaveBeenCalled();
    });

    it('prompts with the parsed hostname, not the raw configured URL', async () => {
      const deps = harness();
      await ensureTmsServerApproved(
        'https://tms.evil.test/base?ignored#frag',
        'env',
        deps
      );
      const message = deps.promptForApproval.mock.calls[0]?.[0] ?? '';
      expect(message).toContain('tms.evil.test');
      expect(message).not.toContain('#frag');
    });
  });

  describe('non-interactive fail-closed', () => {
    it('never prompts when prompting is unavailable', async () => {
      const deps = harness({
        canPrompt: jest.fn<boolean, []>(() => false),
      });
      await expect(
        ensureTmsServerApproved('https://tms.evil.test', 'env', deps)
      ).rejects.toThrow(ConfigError);
      expect(deps.promptForApproval).not.toHaveBeenCalled();
    });

    it('exits 7 so the failure is a config error, not a generic one', async () => {
      const deps = harness({
        canPrompt: jest.fn<boolean, []>(() => false),
      });
      expect.assertions(2);
      try {
        await ensureTmsServerApproved('https://tms.evil.test', 'env', deps);
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        expect((err as ConfigError).exitCode).toBe(7);
      }
    });

    it('names the host and the exact config command to approve it', async () => {
      const deps = harness({
        canPrompt: jest.fn<boolean, []>(() => false),
      });
      expect.assertions(2);
      try {
        await ensureTmsServerApproved('https://tms.evil.test', 'env', deps);
      } catch (err) {
        const text = `${(err as ConfigError).message}\n${(err as ConfigError).suggestion ?? ''}`;
        expect(text).toContain('tms.evil.test');
        expect(text).toContain(
          'deepl config set tms.allowedServers tms.evil.test'
        );
      }
    });

    it('preserves already-approved hosts in the suggested command', async () => {
      const deps = harness({
        readAllowedServers: jest.fn<string[], []>(() => [
          'tms.a.example',
          'tms.b.example',
        ]),
        canPrompt: jest.fn<boolean, []>(() => false),
      });
      expect.assertions(1);
      try {
        await ensureTmsServerApproved('https://tms.new.example', 'env', deps);
      } catch (err) {
        expect((err as ConfigError).suggestion).toContain(
          'deepl config set tms.allowedServers tms.a.example,tms.b.example,tms.new.example'
        );
      }
    });
  });

  describe('default canPrompt', () => {
    let originalIsTTY: boolean | undefined;

    beforeEach(() => {
      originalIsTTY = process.stdin.isTTY;
    });

    afterEach(() => {
      setNoInput(false);
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
    });

    function setTTY(value: boolean | undefined): void {
      Object.defineProperty(process.stdin, 'isTTY', {
        value,
        writable: true,
        configurable: true,
      });
    }

    it('fails closed on a non-TTY stdin even when a prompt would be answered', async () => {
      setTTY(undefined);
      const deps = harness();
      await expect(
        ensureTmsServerApproved('https://tms.evil.test', 'env', {
          readAllowedServers: deps.readAllowedServers,
          approveServer: deps.approveServer,
          promptForApproval: deps.promptForApproval,
        })
      ).rejects.toThrow(ConfigError);
      expect(deps.promptForApproval).not.toHaveBeenCalled();
    });

    it('fails closed under --no-input even on a TTY', async () => {
      setTTY(true);
      setNoInput(true);
      const deps = harness();
      await expect(
        ensureTmsServerApproved('https://tms.evil.test', 'env', {
          readAllowedServers: deps.readAllowedServers,
          approveServer: deps.approveServer,
          promptForApproval: deps.promptForApproval,
        })
      ).rejects.toThrow(ConfigError);
      expect(deps.promptForApproval).not.toHaveBeenCalled();
    });

    it('prompts on a TTY without --no-input', async () => {
      setTTY(true);
      const deps = harness();
      await ensureTmsServerApproved('https://tms.evil.test', 'env', {
        readAllowedServers: deps.readAllowedServers,
        approveServer: deps.approveServer,
        promptForApproval: deps.promptForApproval,
      });
      expect(deps.promptForApproval).toHaveBeenCalled();
    });
  });

  describe('malformed server URLs', () => {
    it('defers an unparseable URL to the client’s own validation', async () => {
      const deps = harness({
        canPrompt: jest.fn<boolean, []>(() => false),
      });
      await expect(
        ensureTmsServerApproved('not a url', 'env', deps)
      ).resolves.toBeUndefined();
      expect(deps.promptForApproval).not.toHaveBeenCalled();
    });
  });
});

describe('tmsServerOrigin', () => {
  it('reduces a server URL to its origin', () => {
    expect(tmsServerOrigin('https://tms.example.com/base/path')).toBe(
      'https://tms.example.com'
    );
  });

  it('keeps a non-default port', () => {
    expect(tmsServerOrigin('https://tms.example.com:8443/x')).toBe(
      'https://tms.example.com:8443'
    );
  });

  it('falls back to a sanitized value for an unparseable URL', () => {
    expect(tmsServerOrigin('not a url')).toBe('not a url');
  });

  it('neutralizes terminal control sequences in the unparseable fallback', () => {
    const hostile = 'ht tp://x\u001b]0;pwned\u0007';
    const rendered = tmsServerOrigin(hostile);
    expect(rendered).not.toContain('\u001b');
    expect(rendered).not.toContain('\u0007');
  });
});
