// UI polish pass — styles only, no logic changes

'use client';

import Link from 'next/link';
import { Avatar } from 'antd';
import NotificationPanel from '@/components/ui/NotificationPanel/NotificationPanel';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAuthStore } from '@/stores/auth.store';
import { useUser } from '@/lib/query/users';
import { tokens } from '@/lib/theme/tokens';

/**
 * Notifications bell and signed-in user profile link — shared by page and project headers.
 */
export default function HeaderActions({
  compact = false,
}: {
  compact?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const user = useAuthStore((state) => state.user);
  const canManageUsers = useAuthStore(
    (state) => state.capabilities.canManageUsers,
  );
  const { data: userDetail } = useUser(
    user?.id ?? '',
    Boolean(user?.id) && canManageUsers,
  );

  const displayName = user
    ? `${user.firstName} ${user.lastName}`
    : t('common.defaultUser');
  const avatarInitial = user?.firstName?.charAt(0)?.toUpperCase() ?? 'U';
  const roleName = userDetail?.userRoles?.[0]?.role?.name ?? t('common.defaultUser');

  return (
    <div
      className={[
        'flex shrink-0 items-center',
        compact ? 'gap-1' : 'gap-2',
      ].join(' ')}
    >
      <NotificationPanel />
      <Link
        href="/profile"
        className={[
          'flex shrink-0 items-center rounded-lg transition-colors hover:bg-[var(--color-surface-secondary)]',
          compact ? 'gap-0 p-0' : 'gap-2 px-1.5 py-1',
        ].join(' ')}
        aria-label={t('common.openProfile')}
      >
        <Avatar
          size={compact ? 28 : 28}
          style={{
            backgroundColor: tokens.colorBlue50,
            color: tokens.colorBlue800,
            fontWeight: 500,
            fontSize: 11,
          }}
        >
          {avatarInitial}
        </Avatar>
        {!compact && (
          <div className="hidden text-[13px] md:block">
            <p
              className="font-medium leading-[1.4]"
              style={{ color: tokens.colorTextPrimary }}
            >
              {displayName}
            </p>
            <p
              className="text-[10px] font-normal leading-[1.4]"
              style={{ color: tokens.colorTextTertiary }}
            >
              {roleName}
            </p>
          </div>
        )}
      </Link>
    </div>
  );
}
