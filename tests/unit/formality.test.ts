import { normalizeFormality } from '../../src/utils/formality';

describe('normalizeFormality', () => {
  describe('text API', () => {
    it('should map formal to more', () => {
      expect(normalizeFormality('formal', 'text')).toBe('more');
    });

    it('should map informal to less', () => {
      expect(normalizeFormality('informal', 'text')).toBe('less');
    });

    it('should pass through native text values unchanged', () => {
      expect(normalizeFormality('default', 'text')).toBe('default');
      expect(normalizeFormality('more', 'text')).toBe('more');
      expect(normalizeFormality('less', 'text')).toBe('less');
      expect(normalizeFormality('prefer_more', 'text')).toBe('prefer_more');
      expect(normalizeFormality('prefer_less', 'text')).toBe('prefer_less');
    });
  });

  describe('voice API', () => {
    it('should map prefer_more to formal', () => {
      expect(normalizeFormality('prefer_more', 'voice')).toBe('formal');
    });

    it('should map prefer_less to informal', () => {
      expect(normalizeFormality('prefer_less', 'voice')).toBe('informal');
    });

    it('should pass through native voice values unchanged', () => {
      expect(normalizeFormality('default', 'voice')).toBe('default');
      expect(normalizeFormality('formal', 'voice')).toBe('formal');
      expect(normalizeFormality('informal', 'voice')).toBe('informal');
      expect(normalizeFormality('more', 'voice')).toBe('more');
      expect(normalizeFormality('less', 'voice')).toBe('less');
    });
  });
});
