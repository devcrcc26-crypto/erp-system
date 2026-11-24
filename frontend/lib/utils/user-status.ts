import type { User } from '@/lib/api/types';

/** True when the account has a sign-in path (email invite or login name). */
function hasLoginPath(user: User): boolean {
  return Boolean(user.email?.trim() || user.loginName?.trim());
}

export type UserStatusVariant = 'default' | 'warning' | 'success' | 'error';

/**
 * Status for the users list and employee detail.
 * Employment SEPARATED / INACTIVE win over account flags so separated
 * people are not labelled as mere inactive accounts.
 * Otherwise: Active = signed in at least once; Pending = has login path
 * but never signed in; Inactive = account disabled; No login = record-only.
 */
export function userStatusVariant(user: User): UserStatusVariant {
  if (user.employmentStatus === 'SEPARATED') {
    return 'error';
  }
  if (user.employmentStatus === 'INACTIVE') {
    return 'warning';
  }
  if (!user.isActive) {
    return 'default';
  }
  if (user.lastLogin) {
    return 'success';
  }
  if (!hasLoginPath(user)) {
    return 'default';
  }
  return 'warning';
}

export function userStatusLabel(
  user: User,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (user.employmentStatus === 'SEPARATED') {
    return t('users.employment.statusSeparatedShort');
  }
  if (user.employmentStatus === 'INACTIVE') {
    return t('users.employment.statusInactiveShort');
  }
  if (!user.isActive) {
    return t('users.statusInactive');
  }
  if (user.lastLogin) {
    return t('users.statusActive');
  }
  if (!hasLoginPath(user)) {
    return t('users.statusNoLogin');
  }
  return t('users.statusPending');
}

/** Active account that can sign in but has never logged in. */
export function isPendingFirstLogin(user: User): boolean {
  return Boolean(
    user.employmentStatus !== 'SEPARATED' &&
      user.employmentStatus !== 'INACTIVE' &&
      user.isActive &&
      !user.lastLogin &&
      hasLoginPath(user),
  );
}
