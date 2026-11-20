import { describe, expect, it } from 'vitest';
import type { User } from '@/lib/api/types';
import {
  isPendingFirstLogin,
  userStatusLabel,
  userStatusVariant,
} from '@/lib/utils/user-status';

function user(overrides: Partial<User>): User {
  return {
    id: 'u1',
    companyId: 'c1',
    employeeId: 'CC-0001',
    firstName: 'Ada',
    lastName: 'Lovelace',
    chineseName: null,
    email: null,
    phone: null,
    preferredLanguage: null,
    preferredTimezone: null,
    preferredDateFormat: null,
    isActive: true,
    mfaEnabled: false,
    emailVerifiedAt: null,
    lastLogin: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const t = (key: string): string => key;

describe('userStatusLabel / userStatusVariant', () => {
  it('shows inactive when the account is disabled', () => {
    const u = user({ isActive: false, email: 'a@b.com', lastLogin: '2026-01-02' });
    expect(userStatusLabel(u, t)).toBe('users.statusInactive');
    expect(userStatusVariant(u)).toBe('default');
  });

  it('shows no login for record-only employees', () => {
    const u = user({ email: null, loginName: null, lastLogin: null });
    expect(userStatusLabel(u, t)).toBe('users.statusNoLogin');
    expect(userStatusVariant(u)).toBe('default');
    expect(isPendingFirstLogin(u)).toBe(false);
  });

  it('stays pending after an email is added until first login', () => {
    const u = user({
      email: 'ada@example.com',
      emailVerifiedAt: '2026-01-01T00:00:00.000Z',
      lastLogin: null,
    });
    expect(userStatusLabel(u, t)).toBe('users.statusPending');
    expect(userStatusVariant(u)).toBe('warning');
    expect(isPendingFirstLogin(u)).toBe(true);
  });

  it('becomes active only after first login', () => {
    const u = user({
      email: 'ada@example.com',
      emailVerifiedAt: '2026-01-01T00:00:00.000Z',
      lastLogin: '2026-01-05T08:00:00.000Z',
    });
    expect(userStatusLabel(u, t)).toBe('users.statusActive');
    expect(userStatusVariant(u)).toBe('success');
    expect(isPendingFirstLogin(u)).toBe(false);
  });

  it('treats login-name accounts as pending until first login', () => {
    const u = user({ email: null, loginName: 'ada.l', lastLogin: null });
    expect(userStatusLabel(u, t)).toBe('users.statusPending');
    expect(isPendingFirstLogin(u)).toBe(true);
  });
});
