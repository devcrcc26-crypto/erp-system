import { describe, expect, it } from 'vitest';
import { translateEpc } from '@/lib/i18n/epc-messages';
import {
  formatApprovalCategoryDescription,
  formatApprovalCategoryName,
} from '@/lib/utils/approval-category-display';

describe('formatApprovalCategoryName', () => {
  it('returns Chinese for a known code when locale is zh', () => {
    const t = (key: string): string => translateEpc('zh', key);
    expect(formatApprovalCategoryName('LEAVE_REQUEST', t, 'Leave Request')).toBe(
      '请假申请',
    );
  });

  it('returns English for a known code when locale is en', () => {
    const t = (key: string): string => translateEpc('en', key);
    expect(formatApprovalCategoryName('LEAVE_REQUEST', t, 'Leave Request')).toBe(
      'Leave Request',
    );
  });

  it('falls back to the API name for unknown codes', () => {
    const t = (key: string): string => translateEpc('zh', key);
    expect(
      formatApprovalCategoryName('CUSTOM_WIDGET', t, 'Custom Widget'),
    ).toBe('Custom Widget');
  });
});

describe('formatApprovalCategoryDescription', () => {
  it('returns Chinese description for a known code', () => {
    const t = (key: string): string => translateEpc('zh', key);
    expect(
      formatApprovalCategoryDescription(
        'OVERTIME_APPLICATION',
        t,
        'Application for overtime work outside normal working hours.',
      ),
    ).toBe('正常工作时间以外的加班申请。');
  });
});
