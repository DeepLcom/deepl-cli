/**
 * Tests for tag_handling_version pinning
 */

import {
  resolveTagHandlingVersion,
  DEFAULT_TAG_HANDLING_VERSION,
} from '../../src/utils/tag-handling-version.js';

describe('resolveTagHandlingVersion', () => {
  it('should pin v2 as the default', () => {
    expect(DEFAULT_TAG_HANDLING_VERSION).toBe('v2');
  });

  it('should return undefined when tag handling is off', () => {
    expect(resolveTagHandlingVersion({})).toBeUndefined();
  });

  it('should pin the default version when tag handling is on without a version', () => {
    expect(resolveTagHandlingVersion({ tagHandling: 'xml' })).toBe('v2');
    expect(resolveTagHandlingVersion({ tagHandling: 'html' })).toBe('v2');
  });

  it('should honour an explicit v1 over the pinned default', () => {
    expect(resolveTagHandlingVersion({ tagHandling: 'xml', tagHandlingVersion: 'v1' })).toBe('v1');
  });

  it('should honour an explicit v2', () => {
    expect(resolveTagHandlingVersion({ tagHandling: 'html', tagHandlingVersion: 'v2' })).toBe('v2');
  });

  it('should keep an explicit version that arrived without tag handling', () => {
    expect(resolveTagHandlingVersion({ tagHandlingVersion: 'v1' })).toBe('v1');
  });
});
