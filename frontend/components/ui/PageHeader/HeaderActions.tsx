'use client';

import Link from 'next/link';
import { Avatar } from 'antd';
import NotificationPanel from '@/components/ui/NotificationPanel/NotificationPanel';
import FontSizeControl from '@/components/ui/FontSizeControl/FontSizeControl';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAuthStore } from '@/stores/auth.store';
import { useCurrentUser } from '@/lib/query/profile';
import { formatUserName } from '@/lib/utils/user-display';
import { tokens } from '@/lib/theme/tokens';

/**
 * Notifications bell and signed-in user profile link - shared by page and project headers.
 */
export default function HeaderActions({
  compact = false,
}: {
  compact?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const user = useAuthStore((state) => state.user);
  const { data: profile, isLoading: profileLoading } = useCurrentUser();
  const sessionProfile =
    profile && user && profile.id === user.id ? profile : undefined;

  const displayName = user
    ? formatUserName(user)
    : t('common.defaultUser');
  const avatarInitial = user?.firstName?.charAt(0)?.toUpperCase() ?? 'U';
  const roleName = sessionProfile
    ? sessionProfile.roles.map((role) => role.name).join(', ')
    : profileLoading
      ? '…'
      : t('common.defaultUser');

  return (
    <div
      className={[
        'flex shrink-0 items-center',
        compact ? 'gap-1' : 'gap-2',
      ].join(' ')}
    >
      <FontSizeControl compact={compact} />
      <NotificationPanel />
      {sessionProfile?.roles.length ? (
        <span
          className="max-w-[140px] truncate rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: tokens.colorPrimaryLight,
            color: tokens.colorPrimary,
          }}
          title={roleName}
        >
          {roleName}
        </span>
      ) : null}
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
        <div
          className={[
            'text-[13px]',
            compact ? 'hidden' : 'hidden md:block',
          ].join(' ')}
        >
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
      </Link>
    </div>
  );
}
