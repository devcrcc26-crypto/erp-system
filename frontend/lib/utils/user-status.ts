import type { User } from '@/lib/api/types';

export function userStatusVariant(user: User): 'default' | 'warning' | 'success' {
  if (!user.isActive) {
    return 'default';
  }
  if (!user.email) {
    return 'default';
  }
  if (!user.emailVerifiedAt) {
    return 'warning';
  }
  return 'success';
}

export function userStatusLabel(
  user: User,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (!user.isActive) {
    return t('users.statusInactive');
  }
  if (!user.email) {
    return t('users.statusNoLogin');
  }
  if (!user.emailVerifiedAt) {
    return t('users.statusPending');
  }
  return t('users.statusActive');
}
