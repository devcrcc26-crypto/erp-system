/**
 * Employee field rules + Ant Design Form helpers.
 * Mirrored from backend user-field.rules.ts - change both together.
 */

import type { Rule } from 'antd/es/form';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

/** Letters in any script (Latin, Ethiopic, Han…) plus spaces . ' ’ - ; starts with a letter. */
export const USER_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
export const USER_NAME_MAX = 100;

/** Chinese characters, with optional middle dot or spaces. */
export const CHINESE_NAME_PATTERN = /^[\p{Script=Han}·・ ]+$/u;
export const CHINESE_NAME_MAX = 50;

/** 7–15 digits, optional leading +, single spaces or hyphens between digits. */
export const PHONE_PATTERN = /^\+?\d(?:[ -]?\d){6,14}$/;

/** 2–20 letters, digits or hyphens; starts and ends with a letter or digit. */
export const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,18}[A-Za-z0-9]$/;

/** 4–30 letters, digits, spaces or hyphens; starts and ends with a letter or digit. */
export const NATIONAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 -]{2,28}[A-Za-z0-9]$/;

export const EMAIL_MAX = 254;
export const ADDRESS_MAX = 100;
export const HOUSE_NUMBER_MAX = 20;
export const FIELD_OF_STUDY_MAX = 100;

/** Ethiopian Labour Proclamation 1156/2019 minimum working age is 15. */
export const MIN_EMPLOYEE_AGE = 15;
export const MAX_EMPLOYEE_AGE = 100;

export const MAX_EMERGENCY_CONTACTS = 5;

type Translate = (key: string, values?: Record<string, string | number>) => string;

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim());
}

function asDayjs(value: unknown): Dayjs | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (dayjs.isDayjs(value)) {
    return value.isValid() ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed : null;
  }
  return null;
}

/** Optional string: skip further checks when blank. */
export function optionalPatternRule(
  pattern: RegExp,
  message: string,
): Rule {
  return {
    validator: async (_rule, value: unknown) => {
      if (isBlank(value)) {
        return;
      }
      if (typeof value !== 'string' || !pattern.test(value.trim())) {
        throw new Error(message);
      }
    },
  };
}

/** Required non-blank string matching a pattern. */
export function requiredPatternRule(
  pattern: RegExp,
  requiredMessage: string,
  patternMessage: string,
): Rule[] {
  return [
    { required: true, whitespace: true, message: requiredMessage },
    { pattern, message: patternMessage },
  ];
}

export function optionalMaxLengthRule(max: number, message: string): Rule {
  return {
    validator: async (_rule, value: unknown) => {
      if (isBlank(value)) {
        return;
      }
      if (typeof value === 'string' && value.trim().length > max) {
        throw new Error(message);
      }
    },
  };
}

export function optionalEmailRule(invalidMessage: string, maxLength = EMAIL_MAX): Rule {
  return {
    validator: async (_rule, value: unknown) => {
      if (isBlank(value)) {
        return;
      }
      const trimmed = String(value).trim();
      if (trimmed.length > maxLength) {
        throw new Error(invalidMessage);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        throw new Error(invalidMessage);
      }
    },
  };
}

export function nameFieldRules(
  t: Translate,
  options: { required: boolean; requiredMessage?: string },
): Rule[] {
  if (options.required) {
    return [
      {
        required: true,
        whitespace: true,
        message: options.requiredMessage ?? t('common.required'),
      },
      {
        pattern: USER_NAME_PATTERN,
        message: t('validation.invalidName'),
      },
      { max: USER_NAME_MAX, message: t('validation.maxLength', { max: USER_NAME_MAX }) },
    ];
  }
  return [
    optionalPatternRule(USER_NAME_PATTERN, t('validation.invalidName')),
    optionalMaxLengthRule(
      USER_NAME_MAX,
      t('validation.maxLength', { max: USER_NAME_MAX }),
    ),
  ];
}

export function chineseNameRules(t: Translate): Rule[] {
  return [
    optionalPatternRule(CHINESE_NAME_PATTERN, t('validation.invalidChineseName')),
    optionalMaxLengthRule(
      CHINESE_NAME_MAX,
      t('validation.maxLength', { max: CHINESE_NAME_MAX }),
    ),
  ];
}

export function phoneRules(
  t: Translate,
  options: { required?: boolean } = {},
): Rule[] {
  if (options.required) {
    return [
      { required: true, whitespace: true, message: t('validation.requiredPhone') },
      { pattern: PHONE_PATTERN, message: t('validation.invalidPhone') },
    ];
  }
  return [optionalPatternRule(PHONE_PATTERN, t('validation.invalidPhone'))];
}

export function employeeIdRules(t: Translate): Rule[] {
  return [
    optionalPatternRule(EMPLOYEE_ID_PATTERN, t('validation.invalidEmployeeId')),
  ];
}

export function nationalIdRules(t: Translate): Rule[] {
  return [
    optionalPatternRule(NATIONAL_ID_PATTERN, t('validation.invalidNationalId')),
  ];
}

export function addressFieldRules(t: Translate, max = ADDRESS_MAX): Rule[] {
  return [
    optionalMaxLengthRule(max, t('validation.maxLength', { max })),
  ];
}

export function fieldOfStudyRules(t: Translate): Rule[] {
  return [
    optionalMaxLengthRule(
      FIELD_OF_STUDY_MAX,
      t('validation.maxLength', { max: FIELD_OF_STUDY_MAX }),
    ),
  ];
}

export function dateOfBirthRules(t: Translate): Rule[] {
  return [
    {
      validator: async (_rule, value: unknown) => {
        const date = asDayjs(value);
        if (!date) {
          return;
        }
        const today = dayjs().startOf('day');
        if (date.isAfter(today, 'day')) {
          throw new Error(t('validation.dateNotFuture'));
        }
        const age = today.diff(date.startOf('day'), 'year');
        if (age < MIN_EMPLOYEE_AGE || age > MAX_EMPLOYEE_AGE) {
          throw new Error(
            t('validation.ageBetween', {
              min: MIN_EMPLOYEE_AGE,
              max: MAX_EMPLOYEE_AGE,
            }),
          );
        }
      },
    },
  ];
}

/** DatePicker guard: greys out days after today. */
export function disableFutureDates(current: Dayjs): boolean {
  return Boolean(current) && current.isAfter(dayjs(), 'day');
}

/** DatePicker guard for experience dates: no future days, none before the birth date. */
export function disableExperienceDates(
  dateOfBirth?: Dayjs | string | null,
): (current: Dayjs) => boolean {
  const birth = asDayjs(dateOfBirth);
  return (current: Dayjs): boolean => {
    if (!current) {
      return false;
    }
    if (current.isAfter(dayjs(), 'day')) {
      return true;
    }
    return Boolean(birth && current.isBefore(birth, 'day'));
  };
}

/** Employment date: not in the future and not before the date of birth. */
export function employmentDateRules(t: Translate): Rule[] {
  return [
    {
      validator: async (_rule, value: unknown) => {
        const date = asDayjs(value);
        if (!date) {
          return;
        }
        const today = dayjs().startOf('day');
        if (date.isAfter(today, 'day')) {
          throw new Error(t('validation.dateNotFuture'));
        }
      },
    },
    ({ getFieldValue }) => ({
      validator: async (_rule, value: unknown) => {
        const experience = asDayjs(value);
        const birth = asDayjs(getFieldValue('dateOfBirth'));
        if (!experience || !birth) {
          return;
        }
        if (experience.isBefore(birth, 'day')) {
          throw new Error(t('validation.experienceBeforeBirth'));
        }
      },
    }),
  ];
}

