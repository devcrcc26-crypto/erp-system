'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, Dropdown } from 'antd';
import {
  LogoutOutlined,
  RightOutlined,
  UserOutlined,
} from '@ant-design/icons';
import NotificationPanel from '@/components/ui/NotificationPanel/NotificationPanel';
import FontSizeControl from '@/components/ui/FontSizeControl/FontSizeControl';
import LanguageControl from '@/components/ui/LanguageControl/LanguageControl';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAuthStore } from '@/stores/auth.store';
import { useLogout } from '@/lib/query/auth';
import { useCurrentUser, useMyProfilePhotoUrl } from '@/lib/query/profile';
import { signOutLocally } from '@/lib/auth/sign-out-locally';
import { formatUserName, pickTopLevelRoleName } from '@/lib/utils/user-display';
import { tokens } from '@/lib/theme/tokens';

function ProfileMenuRow({
  href,
  icon,
  label,
  onClick,
  tone = 'default',
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  tone?: 'default' | 'danger';
}): React.ReactNode {
  const iconBg =
    tone === 'danger' ? tokens.colorRed50 : tokens.colorPrimaryLight;
  const iconColor =
    tone === 'danger' ? tokens.colorRed400 : tokens.colorPrimary;
  const textColor =
    tone === 'danger' ? tokens.colorRed600 : tokens.colorTextPrimary;

  const content = (
    <>
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[14px]"
        style={{ backgroundColor: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      <span
        className="min-w-0 flex-1 truncate text-[13px] font-medium"
        style={{ color: textColor }}
      >
        {label}
      </span>
      {href ? (
        <RightOutlined
          className="shrink-0 text-[11px]"
          style={{ color: tokens.colorTextSecondary }}
        />
      ) : null}
    </>
  );

  const className =
    'erp-hd-menu-row flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left no-underline transition-colors';

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

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
  const [menuOpen, setMenuOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const { data: profile, isLoading: profileLoading } = useCurrentUser();
  const sessionProfile =
    profile && user && profile.id === user.id ? profile : undefined;
  const photoQuery = useMyProfilePhotoUrl(
    Boolean(sessionProfile?.photoDocumentId),
  );

  // Prefer /auth/me (includes middleName); fall back to login payload.
  const displayName = sessionProfile
    ? formatUserName(sessionProfile)
    : user
      ? formatUserName(user)
      : t('common.defaultUser');
  const avatarInitial =
    (sessionProfile?.firstName ?? user?.firstName)?.charAt(0)?.toUpperCase() ??
    'U';
  const roleName = sessionProfile
    ? pickTopLevelRoleName(sessionProfile.roles, t('common.defaultUser'))
    : profileLoading
      ? '…'
      : t('common.defaultUser');
  const email = user?.email ?? '';

  async function handleLogout(): Promise<void> {
    try {
      await logout.mutateAsync();
    } catch {
      // Backend may fail or time out — still clear local session.
    } finally {
      signOutLocally();
      router.replace('/login');
    }
  }

  const profileTrigger = (
    <button
      type="button"
      className={[
        'erp-shell-profile-trigger flex shrink-0 items-center rounded-[10px] transition-colors',
        compact ? 'gap-0 p-0.5' : 'gap-2 px-1.5 py-1',
        menuOpen
          ? 'bg-[var(--color-teal-50)]'
          : 'hover:bg-[var(--color-surface-secondary)]',
      ].join(' ')}
      aria-label={t('common.openProfile')}
      aria-expanded={menuOpen}
    >
      <Avatar
        size={compact ? 28 : 32}
        src={photoQuery.data?.url}
        style={{
          backgroundColor: photoQuery.data?.url
            ? undefined
            : tokens.colorPrimaryLight,
          color: tokens.colorTeal600,
          fontWeight: 600,
          fontSize: 12,
          border: menuOpen
            ? `2px solid ${tokens.colorPrimary}`
            : '2px solid transparent',
        }}
      >
        {avatarInitial}
      </Avatar>
      <div className="erp-shell-profile-meta hidden text-left text-[13px] xl:block">
        <p
          className="m-0 max-w-[140px] truncate font-medium leading-[1.4]"
          style={{ color: tokens.colorTextPrimary }}
        >
          {displayName}
        </p>
        <p
          className="m-0 max-w-[140px] truncate text-[12px] font-normal leading-[1.4]"
          style={{ color: tokens.colorTextSecondary }}
        >
          {roleName}
        </p>
      </div>
    </button>
  );

  const dropdownContent = (
    <div
      className="erp-header-dropdown-v2 flex w-[min(320px,calc(100vw-24px))] flex-col"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="erp-hd-head px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar
            size={48}
            src={photoQuery.data?.url}
            style={{
              backgroundColor: photoQuery.data?.url
                ? undefined
                : tokens.colorTeal600,
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 17,
              flexShrink: 0,
            }}
          >
            {avatarInitial}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="erp-hd-title truncate">{displayName}</p>
            {email ? <p className="erp-hd-sub truncate">{email}</p> : null}
            <span className="erp-hd-role">{roleName}</span>
          </div>
        </div>
      </div>

      <div className="p-2">
        <ProfileMenuRow
          href="/profile"
          icon={<UserOutlined />}
          label={t('nav.profile')}
        />
      </div>

      <div className="erp-hd-section px-4 pb-3 pt-3">
        <p className="erp-hd-section-label">{t('common.preferences')}</p>
        <div className="flex flex-col gap-1.5">
          <div className="erp-hd-pref-row">
            <span className="erp-hd-pref-label">{t('common.language')}</span>
            <LanguageControl compact />
          </div>
          <div className="erp-hd-pref-row">
            <span className="erp-hd-pref-label">{t('common.fontSize')}</span>
            <FontSizeControl compact />
          </div>
        </div>
      </div>

      <div className="erp-hd-foot p-2">
        <ProfileMenuRow
          icon={<LogoutOutlined />}
          label={logout.isPending ? t('nav.signingOut') : t('nav.logout')}
          tone="danger"
          onClick={() => {
            if (!logout.isPending) {
              void handleLogout();
            }
          }}
        />
      </div>
    </div>
  );

  return (
    <div className="erp-shell-header-actions-cluster flex shrink-0 items-center gap-0.5 sm:gap-1.5">
      <div className="hidden sm:block">
        <LanguageControl compact />
      </div>
      <NotificationPanel />
      <Dropdown
        open={menuOpen}
        onOpenChange={setMenuOpen}
        trigger={['click']}
        placement="bottomRight"
        rootClassName="erp-hd-dropdown-root"
        popupRender={() => dropdownContent}
      >
        {profileTrigger}
      </Dropdown>
    </div>
  );
}
