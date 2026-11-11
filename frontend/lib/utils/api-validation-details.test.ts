import { describe, expect, it } from 'vitest';
import {
  extractApiValidationMessages,
  humanizeClassValidatorMessage,
  joinValidationMessages,
} from '@/lib/utils/api-validation-details';

describe('extractApiValidationMessages', () => {
  it('flattens class-validator constraint messages', () => {
    const messages = extractApiValidationMessages([
      {
        property: 'purpose',
        constraints: { isNotEmpty: 'purpose should not be empty' },
      },
      {
        property: 'passengers',
        children: [
          {
            property: '0',
            constraints: { isUuid: 'employeeId must be a UUID' },
          },
        ],
      },
    ]);
    expect(messages).toEqual([
      'purpose should not be empty',
      'employeeId must be a UUID',
    ]);
  });

  it('passes through string arrays', () => {
    expect(extractApiValidationMessages(['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('joinValidationMessages', () => {
  it('joins a few messages for display', () => {
    expect(joinValidationMessages(['one', 'two'])).toBe('one two');
  });
});

describe('humanizeClassValidatorMessage', () => {
  const t = (key: string, vars?: Record<string, string | number>): string => {
    if (key === 'errors.api.validation') {
      return 'Check the form and try again.';
    }
    if (key === 'hr.form.purpose') {
      return 'Purpose';
    }
    if (key === 'errors.api.fieldRequired' && vars?.field) {
      return `${vars.field} is required.`;
    }
    return key;
  };

  it('hides whitelist property errors', () => {
    expect(
      humanizeClassValidatorMessage(
        'property ticketClass should not exist',
        t,
      ),
    ).toBe('Check the form and try again.');
  });

  it('humanizes not-empty messages', () => {
    expect(
      humanizeClassValidatorMessage('purpose should not be empty', t),
    ).toBe('Purpose is required.');
  });
});
