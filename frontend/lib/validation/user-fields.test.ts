import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import type { Rule, RuleObject, RuleRender } from 'antd/es/form';
import {
  CHINESE_NAME_PATTERN,
  EMPLOYEE_ID_PATTERN,
  NATIONAL_ID_PATTERN,
  PHONE_PATTERN,
  USER_NAME_PATTERN,
  chineseNameRules,
  dateOfBirthRules,
  disableExperienceDates,
  disableFutureDates,
  employeeIdRules,
  employmentDateRules,
  nameFieldRules,
  nationalIdRules,
  optionalEmailRule,
  phoneRules,
} from './user-fields';

/** Keys come back verbatim, so assertions read as the message key. */
const t = (key: string): string => key;

/** Runs a rule list the way Ant Design would, returning the first message. */
async function check(
  rules: Rule[],
  value: unknown,
  formValues: Record<string, unknown> = {},
): Promise<string | null> {
  for (const rule of rules) {
    const resolved: RuleObject =
      typeof rule === 'function'
        ? (rule as RuleRender)({
            getFieldValue: (name) => formValues[String(name)],
          } as Parameters<RuleRender>[0])
        : (rule as RuleObject);

    const text = typeof value === 'string' ? value : '';
    if (resolved.required) {
      const blank = value === undefined || value === null || value === '';
      if (blank || (resolved.whitespace && !text.trim())) {
        return String(resolved.message);
      }
    }
    if (resolved.pattern && typeof value === 'string' && !resolved.pattern.test(value)) {
      return String(resolved.message);
    }
    if (typeof resolved.max === 'number' && text.length > resolved.max) {
      return String(resolved.message);
    }
    if (resolved.validator) {
      try {
        await resolved.validator(resolved, value, () => undefined);
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }
  }
  return null;
}

describe('user field patterns', () => {
  it('accepts names in any script, with hyphens, apostrophes and dots', () => {
    for (const name of ['Dong', "O'Neil", 'Jean-Luc', 'St. John', 'አበበ', '董锦霞']) {
      expect(USER_NAME_PATTERN.test(name), name).toBe(true);
    }
    for (const name of ['Dong2', '  ', '-Dong', 'a@b', '']) {
      expect(USER_NAME_PATTERN.test(name), name).toBe(false);
    }
  });

  it('accepts Han characters only for the Chinese name', () => {
    expect(CHINESE_NAME_PATTERN.test('董锦霞')).toBe(true);
    expect(CHINESE_NAME_PATTERN.test('阿卜杜拉·汗')).toBe(true);
    expect(CHINESE_NAME_PATTERN.test('Dong')).toBe(false);
  });

  it('accepts phone numbers of 7 to 15 digits', () => {
    for (const phone of ['0911234567', '+251 911 234 567', '251-911-234-567']) {
      expect(PHONE_PATTERN.test(phone), phone).toBe(true);
    }
    for (const phone of ['123456', '+251 91A 234 567', '1'.repeat(16)]) {
      expect(PHONE_PATTERN.test(phone), phone).toBe(false);
    }
  });

  it('accepts employee and national IDs in the documented shapes', () => {
    expect(EMPLOYEE_ID_PATTERN.test('EMP-0001')).toBe(true);
    expect(EMPLOYEE_ID_PATTERN.test('E')).toBe(false);
    expect(EMPLOYEE_ID_PATTERN.test('EMP_0001')).toBe(false);
    expect(NATIONAL_ID_PATTERN.test('FAN 1234 5678')).toBe(true);
    expect(NATIONAL_ID_PATTERN.test('#!')).toBe(false);
  });
});

describe('user field rules', () => {
  it('requires a non-blank first name and rejects digits', async () => {
    const rules = nameFieldRules(t, {
      required: true,
      requiredMessage: 'common.requiredFirstName',
    });
    expect(await check(rules, '   ')).toBe('common.requiredFirstName');
    expect(await check(rules, 'Dong2')).toBe('validation.invalidName');
    expect(await check(rules, 'x'.repeat(101))).toBe('validation.maxLength');
    expect(await check(rules, 'Dong')).toBeNull();
  });

  it('leaves optional text fields alone when blank', async () => {
    expect(await check(nameFieldRules(t, { required: false }), '')).toBeNull();
    expect(await check(chineseNameRules(t), '')).toBeNull();
    expect(await check(employeeIdRules(t), '')).toBeNull();
    expect(await check(nationalIdRules(t), '')).toBeNull();
    expect(await check(phoneRules(t), '')).toBeNull();
    expect(await check([optionalEmailRule('common.invalidEmail')], '')).toBeNull();
  });

  it('flags bad optional values', async () => {
    expect(await check(chineseNameRules(t), 'Dong')).toBe('validation.invalidChineseName');
    expect(await check(employeeIdRules(t), 'EMP_0001')).toBe('validation.invalidEmployeeId');
    expect(await check(nationalIdRules(t), '#!')).toBe('validation.invalidNationalId');
    expect(await check(phoneRules(t), '12345')).toBe('validation.invalidPhone');
    expect(await check([optionalEmailRule('common.invalidEmail')], 'not-an-email')).toBe(
      'common.invalidEmail',
    );
  });

  it('requires a phone number for emergency contacts', async () => {
    const rules = phoneRules(t, { required: true });
    expect(await check(rules, '')).toBe('validation.requiredPhone');
    expect(await check(rules, '0911234567')).toBeNull();
  });

  it('keeps the birth date in the past and the age within range', async () => {
    const rules = dateOfBirthRules(t);
    expect(await check(rules, dayjs().add(1, 'day'))).toBe('validation.dateNotFuture');
    expect(await check(rules, dayjs().subtract(14, 'year'))).toBe('validation.ageBetween');
    expect(await check(rules, dayjs().subtract(101, 'year'))).toBe('validation.ageBetween');
    expect(await check(rules, dayjs().subtract(30, 'year'))).toBeNull();
    expect(await check(rules, undefined)).toBeNull();
  });

  it('keeps the employment date after the birth date and out of the future', async () => {
    const rules = employmentDateRules(t);
    const dateOfBirth = dayjs().subtract(30, 'year');
    expect(await check(rules, dayjs().add(1, 'day'), { dateOfBirth })).toBe(
      'validation.dateNotFuture',
    );
    expect(await check(rules, dateOfBirth.subtract(1, 'year'), { dateOfBirth })).toBe(
      'validation.experienceBeforeBirth',
    );
    expect(await check(rules, dayjs().subtract(5, 'year'), { dateOfBirth })).toBeNull();
    expect(await check(rules, dayjs().subtract(5, 'year'), {})).toBeNull();
  });
});

describe('date picker guards', () => {
  it('greys out future days', () => {
    expect(disableFutureDates(dayjs().add(1, 'day'))).toBe(true);
    expect(disableFutureDates(dayjs())).toBe(false);
  });

  it('greys out experience days that are in the future or before the birth date', () => {
    const dateOfBirth = dayjs().subtract(30, 'year');
    const disabled = disableExperienceDates(dateOfBirth);
    expect(disabled(dayjs().add(1, 'day'))).toBe(true);
    expect(disabled(dateOfBirth.subtract(1, 'day'))).toBe(true);
    expect(disabled(dayjs().subtract(5, 'year'))).toBe(false);
    expect(disableExperienceDates(undefined)(dateOfBirth.subtract(1, 'day'))).toBe(false);
  });
});
