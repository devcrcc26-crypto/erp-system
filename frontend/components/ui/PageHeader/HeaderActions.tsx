'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, Dropdown } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import NotificationPanel from '@/components/ui/NotificationPanel/NotificationPanel';
import FontSizeControl from '@/components/ui/FontSizeControl/FontSizeControl';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAuthStore } from '@/stores/auth.store';
import { useLogout } from '@/lib/query/auth';
import { useCurrentUser, useMyProfilePhotoUrl } from '@/lib/query/profile';
import { signOutLocally } from '@/lib/auth/sign-out-locally';
import { formatUserName, pickTopLevelRoleName } from '@/lib/utils/user-display';
import { tokens } from '@/lib/theme/tokens';

/**
 * Notifications bell and signed-in user menu (profile + logout + display preferences).
 */
export default function HeaderActions({
  compact = false,
}: {
  compact?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const logout = useLogout();
  const user = useAuthStore((state) => state.user);
  const { data: profile, isLoading: profileLoading } = useCurrentUser();
  const sessionProfile =
    profile && user && profile.id === user.id ? profile : undefined;
  const photoQuery = useMyProfilePhotoUrl(
    Boolean(sessionProfile?.photoDocumentId),
  );

  const displayName = user ? formatUserName(user) : t('common.defaultUser');
  const avatarInitial = user?.firstName?.charAt(0)?.toUpperCase() ?? 'U';
  const roleName = sessionProfile
    ? pickTopLevelRoleName(sessionProfile.roles, t('common.defaultUser'))
    : profileLoading
      ? '…'
      : t('common.defaultUser');

  async function handleLogout(): Promise<void> {
    try {
      await logout.mutateAsync();
    } catch {
      // swallowed; cleared below
    }
    signOutLocally();
    router.replace('/login');
  }

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
        src={photoQuery.data?.url}
        style={{
          backgroundColor: photoQuery.data?.url
            ? undefined
            : tokens.colorBlue50,
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
          className="m-0 font-medium leading-[1.4]"
          style={{ color: tokens.colorTextPrimary }}
        >
          {displayName}
        </p>
        <p
          className="m-0 text-[10px] font-normal leading-[1.4]"
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
            <div className="border-b border-[rgba(0,0,0,0.06)] px-3 py-2.5">
              <p
                className="m-0 truncate text-sm font-medium"
                style={{ color: tokens.colorTextPrimary }}
              >
                {displayName}
              </p>
              <p
                className="m-0 mt-0.5 truncate text-xs"
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
              {t('nav.profile')}
            </Link>

            <div className="mx-2 my-1 border-t border-[rgba(0,0,0,0.06)]" />

            <div className="px-3 py-2">
              <p
                className="m-0 mb-2 text-xs font-medium uppercase tracking-wide"
                style={{ color: tokens.colorTextTertiary }}
              >
                {t('common.fontSize')}
              </p>
              <div className="flex justify-center">
                  <FontSizeControl compact={compact}/>
              </div>
            </div>

            <div className="mx-2 my-1 border-t border-[rgba(0,0,0,0.06)]" />

            <button
              type="button"
              disabled={logout.isPending}
              onClick={() => void handleLogout()}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--color-surface-secondary)] disabled:opacity-60"
              style={{ color: tokens.colorTextPrimary }}
            >
              <LogoutOutlined />
              {logout.isPending ? t('nav.signingOut') : t('nav.logout')}
            </button>
          </div>
        )}
      >
        {profileTrigger}
      </Dropdown>
    </div>
  );
}
