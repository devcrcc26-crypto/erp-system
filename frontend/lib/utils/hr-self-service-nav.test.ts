import { describe, expect, it } from 'vitest';
import {
  resolveLeaveRequestDetailBackHref,
  resolveOvertimeDetailBackHref,
  sanitizeReturnTo,
} from './hr-self-service-nav';

describe('sanitizeReturnTo', () => {
  it('allows profile, users, approvals, and overtime history paths', () => {
    expect(sanitizeReturnTo('/profile?tab=overtime')).toBe(
      '/profile?tab=overtime',
    );
    expect(sanitizeReturnTo('/users/abc?tab=leave')).toBe(
      '/users/abc?tab=leave',
    );
    expect(sanitizeReturnTo('/approvals/req-1')).toBe('/approvals/req-1');
    expect(sanitizeReturnTo('/hr/overtime-history/me')).toBe(
      '/hr/overtime-history/me',
    );
  });

  it('rejects external and HR list paths', () => {
    expect(sanitizeReturnTo('//evil.com')).toBeNull();
    expect(sanitizeReturnTo('/hr/overtime')).toBeNull();
    expect(sanitizeReturnTo(null)).toBeNull();
  });
});

describe('resolveOvertimeDetailBackHref', () => {
  it('returns HR list for hr viewers', () => {
    expect(
      resolveOvertimeDetailBackHref({
        canViewHr: true,
        currentUserId: 'u1',
        sheetEmployeeId: 'u2',
        returnTo: null,
      }),
    ).toBe('/hr/overtime');
  });

  it('returns employee profile leave tab for managers viewing a report', () => {
    expect(
      resolveOvertimeDetailBackHref({
        canViewHr: false,
        currentUserId: 'mgr',
        sheetEmployeeId: 'emp',
        returnTo: null,
      }),
    ).toBe('/users/emp?tab=leave');
  });

  it('returns profile overtime tab for own sheet', () => {
    expect(
      resolveOvertimeDetailBackHref({
        canViewHr: false,
        currentUserId: 'u1',
        sheetEmployeeId: 'u1',
        returnTo: null,
      }),
    ).toBe('/profile?tab=overtime');
  });
});

describe('resolveLeaveRequestDetailBackHref', () => {
  it('prefers sanitized returnTo', () => {
    expect(
      resolveLeaveRequestDetailBackHref({
        canViewHr: false,
        currentUserId: 'u1',
        requestEmployeeId: 'u1',
        returnTo: '/approvals/x',
      }),
    ).toBe('/approvals/x');
  });
});
