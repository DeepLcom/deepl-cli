import {
  MIN_NODE_VERSION,
  assertSupportedNodeVersion,
  unsupportedNodeVersionMessage,
} from '../../../src/cli/node-version-check';
import { ExitCode } from '../../../src/utils/exit-codes';

describe('node-version-check', () => {
  describe('unsupportedNodeVersionMessage', () => {
    it('should return a clear one-line message for Node below the minimum', () => {
      const message = unsupportedNodeVersionMessage('22.17.0');

      expect(message).not.toBeNull();
      expect(message).toContain(`Node.js >= ${MIN_NODE_VERSION}`);
      expect(message).toContain('v22.17.0');
      expect(message).not.toContain('\n');
    });

    it('should return null for the minimum supported version', () => {
      expect(unsupportedNodeVersionMessage(MIN_NODE_VERSION)).toBeNull();
    });

    it('should return null for newer minors within the supported major', () => {
      expect(unsupportedNodeVersionMessage('24.18.1')).toBeNull();
    });

    it('should return null for newer majors', () => {
      expect(unsupportedNodeVersionMessage('25.3.1')).toBeNull();
    });

    // node:sqlite still emits `ExperimentalWarning` on these, so they are not
    // supported even though the major matches.
    it.each(['24.0.0', '24.5.0', '24.14.0'])(
      'should reject %s, where node:sqlite is still experimental',
      (version) => {
        expect(unsupportedNodeVersionMessage(version)).toContain(
          `Node.js >= ${MIN_NODE_VERSION}`
        );
      }
    );

    it('should fail open on unparseable versions', () => {
      expect(unsupportedNodeVersionMessage('weird')).toBeNull();
    });

    it('should still reject an older major given without a minor', () => {
      expect(unsupportedNodeVersionMessage('22')).toContain('v22');
    });

    it('should fail open on a supported major given without a minor', () => {
      expect(unsupportedNodeVersionMessage('24')).toBeNull();
    });
  });

  describe('assertSupportedNodeVersion', () => {
    it('should exit with InvalidInput on unsupported versions', () => {
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      assertSupportedNodeVersion('22.0.0');

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('v22.0.0'));
      expect(exitSpy).toHaveBeenCalledWith(ExitCode.InvalidInput);

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should exit on a Node 24 older than the node:sqlite stability floor', () => {
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      assertSupportedNodeVersion('24.5.0');

      expect(exitSpy).toHaveBeenCalledWith(ExitCode.InvalidInput);

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should be a no-op on supported versions', () => {
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);

      assertSupportedNodeVersion('24.15.0');

      expect(exitSpy).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });
  });
});
