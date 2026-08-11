/**
 * The one branch of repairPrivateFileMode that a real filesystem cannot be
 * talked into on demand: a mode the process is not allowed to change. It needs
 * `fs` mocked wholesale, which is why it is not in private-mode.test.ts.
 */

jest.mock('fs');

import * as fs from 'fs';
import { repairPrivateFileMode } from '../../src/utils/private-mode';

describe('repairPrivateFileMode() when chmod is refused', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    (fs.statSync as jest.Mock).mockReturnValue({ mode: 0o100644 });
    (fs.chmodSync as jest.Mock).mockImplementation(() => {
      throw new Error('EPERM: operation not permitted');
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should report the mode it could not repair rather than failing silently', () => {
    repairPrivateFileMode('/somewhere/config.json', 0o600);

    const warned = consoleErrorSpy.mock.calls
      .map((call) => call.join(' '))
      .join('\n');
    expect(warned).toContain('/somewhere/config.json');
    expect(warned).toContain('0644');
    expect(warned).toContain('EPERM');
  });

  it('should still pass the caller advice on', () => {
    repairPrivateFileMode('/somewhere/config.json', 0o600, 'Rotate the key.');

    const warned = consoleErrorSpy.mock.calls
      .map((call) => call.join(' '))
      .join('\n');
    expect(warned).toContain('Rotate the key.');
  });
});
