import type { User } from '@/lib/api/types';

/**
 * HR "Reset password" action: POST /users/:id/reset-password requires
 * users.edit, so hr.view alone never shows it. Inactive accounts cannot sign in.
 */
export function canResetUserPassword(
  user: Pick<User, 'isActive'>,
  canEditUsers: boolean,
): boolean {
  return canEditUsers && user.isActive;
}
