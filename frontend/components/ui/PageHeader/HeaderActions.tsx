'use client';

import Link from 'next/link';
import { Avatar, Dropdown } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import NotificationPanel from '@/components/ui/NotificationPanel/NotificationPanel';
import FontSizeControl from '@/components/ui/FontSizeControl/FontSizeControl';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAuthStore } from '@/stores/auth.store';
import { useCurrentUser } from '@/lib/query/profile';
import { formatUserName, pickTopLevelRoleName } from '@/lib/utils/user-display';
import { tokens } from '@/lib/theme/tokens';

/**
 * Notifications bell and signed-in user menu (profile + display preferences).
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
    ? pickTopLevelRoleName(sessionProfile.roles, t('common.defaultUser'))
    : profileLoading
      ? '…'
      : t('common.defaultUser');

  const profileTrigger = (
    <button
      type="button"
      className={[
        'flex shrink-0 items-center rounded-lg transition-colors hover:bg-[var(--color-surface-secondary)]',
        compact ? 'gap-0 p-0' : 'gap-2 px-1.5 py-1',
      ].join(' ')}
      aria-label={t('common.openProfile')}
    >
      <Avatar
        size={28}
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
          'text-[13px] text-left',
          compact ? 'hidden' : 'hidden md:block',
        ].join(' ')}
      >
        <p
          className="font-medium leading-[1.4] m-0"
          style={{ color: tokens.colorTextPrimary }}
        >
          {displayName}
        </p>
        <p
          className="text-[10px] font-normal leading-[1.4] m-0"
          style={{ color: tokens.colorTextTertiary }}
        >
          {roleName}
        </p>
      </div>
    </button>
  );

  return (
    <div
      className={[
        'flex shrink-0 items-center',
        compact ? 'gap-1' : 'gap-2',
      ].join(' ')}
    >
      <NotificationPanel />
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        popupRender={() => (
          <div
            className="min-w-[240px] rounded-lg border border-[rgba(0,0,0,0.08)] bg-white py-1 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-3 py-2.5 border-b border-[rgba(0,0,0,0.06)]">
              <p
                className="text-sm font-medium m-0 truncate"
                style={{ color: tokens.colorTextPrimary }}
              >
                {displayName}
              </p>
              <p
                className="text-xs m-0 mt-0.5 truncate"
                style={{ color: tokens.colorTextTertiary }}
              >
                {roleName}
              </p>
            </div>

            <Link
              href="/profile"
              className="flex items-center gap-2 px-3 py-2 text-sm no-underline transition-colors hover:bg-[var(--color-surface-secondary)]"
              style={{ color: tokens.colorTextPrimary }}
            >
              <UserOutlined />
              {t('common.openProfile')}
            </Link>

            <div className="mx-2 my-1 border-t border-[rgba(0,0,0,0.06)]" />

            <div className="px-3 py-2">
              <p
                className="text-xs font-medium uppercase tracking-wide m-0 mb-2"
                style={{ color: tokens.colorTextTertiary }}
              >
                {t('common.fontSize')}
              </p>
              <FontSizeControl />
            </div>
          </div>
        )}
      >
        {profileTrigger}
      </Dropdown>
    </div>
  );
}
