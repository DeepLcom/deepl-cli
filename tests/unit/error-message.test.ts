import { errorMessage } from '../../src/utils/error-message.js';

describe('errorMessage', () => {
  it('should return message from Error instance', () => {
    expect(errorMessage(new Error('test error'))).toBe('test error');
  });

  it('should stringify non-Error values', () => {
    expect(errorMessage('string error')).toBe('string error');
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage(null)).toBe('null');
    expect(errorMessage(undefined)).toBe('undefined');
  });
});
