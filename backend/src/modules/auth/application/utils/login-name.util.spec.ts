import {
  formatDisplayFullName,
  isEmailLoginIdentifier,
  normalizeLoginName,
} from './login-name.util';

describe('login-name.util', () => {
  describe('formatDisplayFullName', () => {
    it('joins first middle last omitting blanks', () => {
      expect(
        formatDisplayFullName({
          firstName: 'Abebe',
          middleName: 'Bekele',
          lastName: 'Kebede',
        }),
      ).toBe('Abebe Bekele Kebede');
      expect(
        formatDisplayFullName({
          firstName: 'Abebe',
          middleName: null,
          lastName: 'Kebede',
        }),
      ).toBe('Abebe Kebede');
    });
  });

  describe('normalizeLoginName', () => {
    it('lowercases, trims, and collapses whitespace', () => {
      expect(normalizeLoginName('  Abebe   Bekele  Kebede ')).toBe(
        'abebe bekele kebede',
      );
    });

    it('applies unicode NFC', () => {
      const composed = 'é'.normalize('NFC');
      const decomposed = 'é'.normalize('NFD');
      expect(normalizeLoginName(decomposed)).toBe(normalizeLoginName(composed));
    });
  });

  describe('isEmailLoginIdentifier', () => {
    it('detects @', () => {
      expect(isEmailLoginIdentifier('a@b.com')).toBe(true);
      expect(isEmailLoginIdentifier('Abebe Kebede')).toBe(false);
    });
  });
});
