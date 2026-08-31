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
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
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
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[14px]"
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
          style={{ color: tokens.colorTextTertiary }}
        />
      ) : null}
    </>
  );

  const className =
    'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left no-underline transition-colors hover:bg-[var(--color-surface-secondary)]';

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

  const displayName = user ? formatUserName(user) : t('common.defaultUser');
  const avatarInitial = user?.firstName?.charAt(0)?.toUpperCase() ?? 'U';
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
      // swallowed; cleared below
    }
    signOutLocally();
    router.replace('/login');
  }

  const profileTrigger = (
    <button
      type="button"
      className={[
        'flex shrink-0 items-center rounded-lg transition-colors',
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
            : tokens.colorBlue50,
          color: tokens.colorBlue800,
          fontWeight: 600,
          fontSize: 12,
          border: menuOpen ? `2px solid ${tokens.colorPrimary}` : '2px solid transparent',
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
          className="m-0 max-w-[140px] truncate font-medium leading-[1.4]"
          style={{ color: tokens.colorTextPrimary }}
        >
          {displayName}
        </p>
        <p
          className="m-0 max-w-[140px] truncate text-[10px] font-normal leading-[1.4]"
          style={{ color: tokens.colorTextTertiary }}
        >
          {roleName}
        </p>
      </div>
    </button>
  );

  const dropdownContent = (
    <div
      className="flex w-[300px] flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] sm:w-[320px]"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-[rgba(0,0,0,0.06)] px-4 py-4">
        <div className="flex items-start gap-3">
          <Avatar
            size={44}
            src={photoQuery.data?.url}
            style={{
              backgroundColor: photoQuery.data?.url
                ? undefined
                : tokens.colorBlue50,
              color: tokens.colorBlue800,
              fontWeight: 600,
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            {avatarInitial}
          </Avatar>
          <div className="min-w-0 flex-1 pt-0.5">
            <p
              className="m-0 truncate text-[14px] font-semibold leading-tight"
              style={{ color: tokens.colorTextPrimary }}
            >
              {displayName}
            </p>
            <div className="mt-1.5">
              <StatusBadge label={roleName} variant="info" />
            </div>
            {email ? (
              <p
                className="m-0 mt-2 truncate text-[12px]"
                style={{ color: tokens.colorTextTertiary }}
              >
                {email}
              </p>
            ) : null}
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

      <div className="mx-3 border-t border-[rgba(0,0,0,0.06)]" />

      <div className="px-4 py-3">
        <p
          className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: tokens.colorTextTertiary }}
        >
          {t('common.preferences')}
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2.5">
            <span
              className="text-[12px] font-medium"
              style={{ color: tokens.colorTextSecondary }}
            >
              {t('common.language')}
            </span>
            <LanguageControl compact={compact} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2.5">
            <span
              className="text-[12px] font-medium"
              style={{ color: tokens.colorTextSecondary }}
            >
              {t('common.fontSize')}
            </span>
            <FontSizeControl compact={compact} />
          </div>
        </div>
      </div>

      <div className="border-t border-[rgba(0,0,0,0.06)] p-2">
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
    <div
      className={[
        'flex shrink-0 items-center',
        compact ? 'gap-1' : 'gap-2',
      ].join(' ')}
    >
      <LanguageControl compact={compact} />
      <NotificationPanel />
      <Dropdown
        open={menuOpen}
        onOpenChange={setMenuOpen}
        trigger={['click']}
        placement="bottomRight"
        popupRender={() => dropdownContent}
      >
        {profileTrigger}
      </Dropdown>
    </div>
  );
}
