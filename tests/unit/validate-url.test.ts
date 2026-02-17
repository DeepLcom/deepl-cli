import { validateApiUrl } from '../../src/utils/validate-url';

describe('validateApiUrl', () => {
  describe('HTTPS URLs (accepted)', () => {
    it('should accept https://api-free.deepl.com/v2', () => {
      expect(() => validateApiUrl('https://api-free.deepl.com/v2')).not.toThrow();
    });

    it('should accept https://api.deepl.com/v2', () => {
      expect(() => validateApiUrl('https://api.deepl.com/v2')).not.toThrow();
    });

    it('should accept any HTTPS URL', () => {
      expect(() => validateApiUrl('https://custom-proxy.example.com/deepl')).not.toThrow();
    });

    it('should accept HTTPS URL with port', () => {
      expect(() => validateApiUrl('https://localhost:8443/v2')).not.toThrow();
    });
  });

  describe('HTTP localhost URLs (accepted for local development)', () => {
    it('should accept http://localhost', () => {
      expect(() => validateApiUrl('http://localhost')).not.toThrow();
    });

    it('should accept http://localhost with port', () => {
      expect(() => validateApiUrl('http://localhost:3000')).not.toThrow();
    });

    it('should accept http://localhost with path', () => {
      expect(() => validateApiUrl('http://localhost:8080/v2')).not.toThrow();
    });

    it('should accept http://127.0.0.1', () => {
      expect(() => validateApiUrl('http://127.0.0.1')).not.toThrow();
    });

    it('should accept http://127.0.0.1 with port', () => {
      expect(() => validateApiUrl('http://127.0.0.1:5000')).not.toThrow();
    });

    it('should accept http://127.0.0.1 with path', () => {
      expect(() => validateApiUrl('http://127.0.0.1:9090/api/v2')).not.toThrow();
    });
  });

  describe('HTTP remote URLs (rejected)', () => {
    it('should reject http://api-free.deepl.com', () => {
      expect(() => validateApiUrl('http://api-free.deepl.com')).toThrow(/Insecure HTTP URL rejected/);
    });

    it('should reject http://api.deepl.com/v2', () => {
      expect(() => validateApiUrl('http://api.deepl.com/v2')).toThrow(/Insecure HTTP URL rejected/);
    });

    it('should reject http://example.com', () => {
      expect(() => validateApiUrl('http://example.com')).toThrow(/Insecure HTTP URL rejected/);
    });

    it('should reject http://evil-server.com/steal-keys', () => {
      expect(() => validateApiUrl('http://evil-server.com/steal-keys')).toThrow(/Insecure HTTP URL rejected/);
    });

    it('should include guidance about HTTPS in error message', () => {
      expect(() => validateApiUrl('http://example.com')).toThrow(/HTTPS/);
    });

    it('should mention credential exposure in error message', () => {
      expect(() => validateApiUrl('http://example.com')).toThrow(/credential exposure/);
    });

    it('should mention localhost exception in error message', () => {
      expect(() => validateApiUrl('http://example.com')).toThrow(/localhost/);
    });
  });

  describe('invalid URLs (rejected)', () => {
    it('should reject non-URL strings', () => {
      expect(() => validateApiUrl('not-a-url')).toThrow(/Invalid URL/);
    });

    it('should reject empty string', () => {
      expect(() => validateApiUrl('')).toThrow(/Invalid URL/);
    });
  });

  describe('unsupported protocols (rejected)', () => {
    it('should reject ftp:// URLs', () => {
      expect(() => validateApiUrl('ftp://example.com')).toThrow(/Unsupported protocol/);
    });

    it('should reject file:// URLs', () => {
      expect(() => validateApiUrl('file:///etc/passwd')).toThrow(/Unsupported protocol/);
    });
  });
});
