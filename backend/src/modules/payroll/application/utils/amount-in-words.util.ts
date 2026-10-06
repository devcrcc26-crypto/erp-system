/**
 * Converts Ethiopian Birr amounts to English words for bank transfer letters.
 * Integer part uses standard American grouping; fractional part is "and N cents".
 */
const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const;

const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
] as const;

const SCALES = ['', 'thousand', 'million', 'billion'] as const;

function capitalizePhrase(phrase: string): string {
  if (!phrase) {
    return phrase;
  }
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function underThousand(n: number): string {
  if (n < 20) {
    return ONES[n] ?? 'zero';
  }
  if (n < 100) {
    const ten = Math.floor(n / 10);
    const one = n % 10;
    return one === 0 ? TENS[ten]! : `${TENS[ten]}-${ONES[one]}`;
  }
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  if (rest === 0) {
    return `${ONES[hundred]} hundred`;
  }
  return `${ONES[hundred]} hundred ${underThousand(rest)}`;
}

function integerToWords(n: number): string {
  if (n === 0) {
    return 'zero';
  }
  const parts: string[] = [];
  let remaining = n;
  let scale = 0;
  while (remaining > 0 && scale < SCALES.length) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      const chunkWords = underThousand(chunk);
      const scaleWord = SCALES[scale];
      parts.unshift(scaleWord ? `${chunkWords} ${scaleWord}` : chunkWords);
    }
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }
  return parts.join(', ');
}

/**
 * Formats a Birr amount as English words.
 *
 * @example 4735453.34 → "Four million, seven hundred thirty-five thousand, four hundred fifty-three and thirty-four cents"
 * @example 95 → "Ninety-five"
 * @example 1000000 → "One million"
 * @example 0.05 → "zero and five cents"
 */
export function birrAmountInWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Amount must be a non-negative finite number');
  }

  const rounded = Math.round(amount * 100) / 100;
  const whole = Math.floor(rounded + 1e-9);
  const cents = Math.round((rounded - whole) * 100);

  if (whole === 0 && cents === 0) {
    return 'Zero';
  }

  if (whole === 0) {
    return `zero and ${integerToWords(cents)} cents`;
  }

  const wholeWords = capitalizePhrase(integerToWords(whole));
  if (cents === 0) {
    return wholeWords;
  }
  return `${wholeWords} and ${integerToWords(cents)} cents`;
}

/**
 * Formats a non-negative integer as capitalized English words (for employee counts).
 */
export function integerInWords(count: number): string {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('Count must be a non-negative integer');
  }
  return capitalizePhrase(integerToWords(count));
}
