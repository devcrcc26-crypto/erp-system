/**
 * Employee field rules. Mirrored in frontend/lib/validation/user-fields.ts -
 * change both together so the form and the API accept the same values.
 */

/** Letters in any script (Latin, Ethiopic, Han…) plus spaces . ' ’ - ; starts with a letter. */
export const USER_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
export const USER_NAME_MAX = 100;

/** Chinese characters, with optional middle dot or spaces (e.g. 董锦霞, 阿卜杜拉·汗). */
export const CHINESE_NAME_PATTERN = /^[\p{Script=Han}·・ ]+$/u;
export const CHINESE_NAME_MAX = 50;

/** 7–15 digits, optional leading +, single spaces or hyphens between digits. */
export const PHONE_PATTERN = /^\+?\d(?:[ -]?\d){6,14}$/;

/** 2–20 letters, digits or hyphens; starts and ends with a letter or digit. */
export const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,18}[A-Za-z0-9]$/;

/** 4–30 letters, digits, spaces or hyphens; starts and ends with a letter or digit. */
export const NATIONAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 -]{2,28}[A-Za-z0-9]$/;

/** Ethiopian Tax Identification Number: exactly 10 digits. */
export const TIN_PATTERN = /^\d{10}$/;

export const EMAIL_MAX = 254;
export const ADDRESS_MAX = 100;
export const HOUSE_NUMBER_MAX = 20;
export const FIELD_OF_STUDY_MAX = 100;
export const YEARS_OF_EXPERIENCE_MAX = 70;

/** Ethiopian Labour Proclamation 1156/2019 minimum working age is 15. */
export const MIN_EMPLOYEE_AGE = 15;
export const MAX_EMPLOYEE_AGE = 100;

export const MAX_EMERGENCY_CONTACTS = 5;

/** class-transformer helper: trims strings, leaves other values untouched. */
export function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
