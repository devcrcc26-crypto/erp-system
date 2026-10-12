import { describe, expect, it } from '@jest/globals';
import { formatEnglishName, formatUserDisplayName } from './user-display.util';

describe('formatEnglishName', () => {
  it('includes middle name when present', () => {
    expect(
      formatEnglishName({
        firstName: 'Abebe',
        middleName: 'Tesfaye',
        lastName: 'Kebede',
      }),
    ).toBe('Abebe Tesfaye Kebede');
  });
});

describe('formatUserDisplayName', () => {
  it('appends Chinese name when present', () => {
    expect(
      formatUserDisplayName({
        firstName: 'Wei',
        middleName: 'Ming',
        lastName: 'Zhang',
        chineseName: '张伟',
      }),
    ).toBe('Wei Ming Zhang (张伟)');
  });
});
