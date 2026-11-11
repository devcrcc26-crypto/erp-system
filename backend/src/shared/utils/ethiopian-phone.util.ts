/**
 * Ethiopian phone numbers in one stored form: `+251` followed by the 9-digit
 * national number. Accepted national numbers start with 9 or 7 (mobile) or
 * 1 (landline, e.g. Addis Ababa 11…).
 */

export type EthiopianPhoneResult =
  | { ok: true; value: string; fixedDoubledPrefix: boolean }
  | { ok: false };

const NATIONAL = /^[971]\d{8}$/;

/**
 * Accepts `+251 9…`, `2519…`, `09…`, `9…`, with spaces, hyphens, dots or
 * parentheses. Also repairs the HR sheet's `(+2519)` template prefix written
 * in front of a full 9-digit number (`(+2519)9XXXXXXXX` → `+2519XXXXXXXX`),
 * only when the repaired value is a valid national number.
 */
export function normaliseEthiopianPhone(
  raw: string | number | null | undefined,
): EthiopianPhoneResult {
  if (raw == null) {
    return { ok: false };
  }
  const text = String(raw).trim();
  const compact = text.replace(/[\s\-.]/g, '');
  if (!/^\(?\+?[\d()]+$/.test(compact)) {
    return { ok: false };
  }

  const doubled = /^\(\+2519\)(\d{9})$/.exec(compact);
  if (doubled && NATIONAL.test(doubled[1])) {
    return { ok: true, value: `+251${doubled[1]}`, fixedDoubledPrefix: true };
  }

  let digits = compact.replace(/[()+]/g, '');
  if (digits.startsWith('251')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (!NATIONAL.test(digits)) {
    return { ok: false };
  }
  return { ok: true, value: `+251${digits}`, fixedDoubledPrefix: false };
}

/**
 * class-transformer helper for phone DTO fields: trims, then stores Ethiopian
 * numbers as `+251…`. Anything else (foreign numbers, typos) is passed through
 * for the field's pattern validator to accept or reject.
 */
export function normalisePhoneInput({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  const result = normaliseEthiopianPhone(trimmed);
  return result.ok ? result.value : trimmed;
}
