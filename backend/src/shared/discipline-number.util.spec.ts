import {
  formatDisciplineNumber,
  formatSubtaskNumber,
} from './discipline-number.util';

describe('discipline-number.util', () => {
  describe('formatDisciplineNumber', () => {
    it('formats overseas number and discipline index', () => {
      expect(formatDisciplineNumber('OS-2024-100', 1)).toBe('OS-2024-100-01');
      expect(formatDisciplineNumber('OS-2024-100', 12)).toBe('OS-2024-100-12');
    });

    it('returns null when inputs are missing', () => {
      expect(formatDisciplineNumber(null, 1)).toBeNull();
      expect(formatDisciplineNumber('OS-2024-100', null)).toBeNull();
    });
  });

  describe('formatSubtaskNumber', () => {
    it('formats full subtask number per discipline scope', () => {
      expect(formatSubtaskNumber('OS-2024-100', 2, 3)).toBe(
        'OS-2024-100-02-03',
      );
    });
  });
});
