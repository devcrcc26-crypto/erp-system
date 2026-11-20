import type { User } from '@/lib/api/types';

/** True when the account has a sign-in path (email invite or login name). */
function hasLoginPath(user: User): boolean {
  return Boolean(user.email?.trim() || user.loginName?.trim());
}

/**
 * Account-access status for the users list and employee detail.
 * Active means the person has signed in at least once — adding an email alone
 * does not count.
 */
export function userStatusVariant(
  user: User,
): 'default' | 'warning' | 'success' {
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
  return Boolean(user.isActive && !user.lastLogin && hasLoginPath(user));
}
