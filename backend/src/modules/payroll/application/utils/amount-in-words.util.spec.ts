import { describe, expect, it } from '@jest/globals';
import {
  birrAmountInWords,
  integerInWords,
} from './amount-in-words.util';

describe('birrAmountInWords', () => {
  it('formats 4,735,453.34 with cents', () => {
    expect(birrAmountInWords(4735453.34)).toBe(
      'Four million, seven hundred thirty-five thousand, four hundred fifty-three and thirty-four cents',
    );
  });

  it('formats 95 without cents', () => {
    expect(birrAmountInWords(95)).toBe('Ninety-five');
  });

  it('formats 1,000,000.00', () => {
    expect(birrAmountInWords(1000000)).toBe('One million');
  });

  it('formats 0.05 as zero and five cents', () => {
    expect(birrAmountInWords(0.05)).toBe('zero and five cents');
  });
});

describe('integerInWords', () => {
  it('capitalizes employee counts', () => {
    expect(integerInWords(3)).toBe('Three');
    expect(integerInWords(21)).toBe('Twenty-one');
  });
});
