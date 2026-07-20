// UI polish pass - styles only, no logic changes

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LogoutOutlined,
  UserOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import {
  buildIconRailItems,
  resolveIconRailKey,
  type IconRailItem,
} from '@/config/navConfig';
import { getNavIcon, navIconClassName } from '@/lib/navigation/nav-icons';
import {
  useCanViewMyComments,
  useCanViewMyWork,
  useCanViewReviewInbox,
  useCanViewSubmittals,
  useEpcCapabilities,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { useCanViewAuditLogs, useCanManageRoles, useCanManageUsers } from '@/hooks/use-auth-capabilities';
import {
  useCanViewDepartmentsNav,
  useCanViewDisciplinesCatalogNav,
} from '@/hooks/use-org-nav-access';
import { canViewGlobalNavKey } from '@/lib/navigation/project-nav-visibility';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useLogout } from '@/lib/query/auth';
import { signOutLocally } from '@/lib/auth/sign-out-locally';
import { tokens } from '@/lib/theme/tokens';

function railItemClass(isActive: boolean, isExpanded: boolean): string {
  const base =
    'flex shrink-0 items-center no-underline transition-colors duration-150';
  if (isExpanded) {
    return [
      base,
      'w-full gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] leading-[1.5]',
      isActive ? 'font-medium' : 'font-normal',
    ].join(' ');
  }
  return [
    base,
    'mx-auto h-8 w-8 justify-center rounded-lg text-[16px]',
    isActive ? 'font-medium' : 'font-normal',
  ].join(' ');
}

function railItemStyle(isActive: boolean): React.CSSProperties {
  if (isActive) {
    return {
      backgroundColor: tokens.colorSidebarActive,
      color: tokens.colorSidebarTextActive,
    };
  }
  return {
    color: tokens.colorSidebarText,
  };
}

function RailNavButton({
  item,
  label,
  isActive,
  isExpanded,
  onNavigate,
}: {
  item: IconRailItem;
  label: string;
  isActive: boolean;
  isExpanded: boolean;
  onNavigate?: () => void;
}): React.ReactNode {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={label}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className={[
        railItemClass(isActive, isExpanded),
        !isActive && isExpanded
          ? 'hover:bg-[var(--color-surface-secondary)]'
          : '',
        !isActive && !isExpanded
          ? 'hover:bg-[var(--color-surface-secondary)]'
          : '',
      ].join(' ')}
      style={railItemStyle(isActive)}
    >
      <span
        className={navIconClassName}
        style={
          isActive
            ? { color: tokens.colorPrimaryHover }
            : { color: tokens.colorTextSecondary }
        }
      >
        {getNavIcon(item.iconKey)}
      </span>
      <span
        className={[
          'truncate transition-all duration-200 ease-in-out',
          isExpanded ? 'w-auto opacity-100' : 'w-0 overflow-hidden opacity-0',
        ].join(' ')}
      >
        {label}
      </span>
    </Link>
  );
}

function RailActionButton({
  label,
  icon,
  isExpanded,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onClick?: () => void;
  disabled?: boolean;
}): React.ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={[
        'flex shrink-0 items-center transition-colors duration-150 disabled:opacity-60',
        isExpanded
          ? 'w-full gap-2.5 rounded-lg border-transparent px-2.5 py-[7px] text-[13px] font-normal leading-[1.5] hover:bg-[var(--color-surface-secondary)]'
          : 'mx-auto h-8 w-8 justify-center rounded-lg text-[16px] hover:bg-[var(--color-surface-secondary)]',
      ].join(' ')}
      style={{ color: tokens.colorTextSecondary }}
    >
      <span className="flex shrink-0 items-center justify-center leading-none">
        {icon}
      </span>
      <span
        className={[
          'truncate transition-all duration-200 ease-in-out',
          isExpanded ? 'w-auto opacity-100' : 'w-0 overflow-hidden opacity-0',
        ].join(' ')}
      >
        {label}
      </span>
    </button>
  );
}

/**
 * Shared main navigation panel - icon rail (desktop) and drawer (mobile).
 */
export default function MainNavPanel({
  isExpanded,
  onNavigate,
  showPinToggle = false,
  pinned = false,
  onTogglePin,
}: {
  isExpanded: boolean;
  onNavigate?: () => void;
  showPinToggle?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
}): React.ReactNode {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();
  const { t } = useEpcTranslation();
  const permLoading = usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const canViewReviewInbox = useCanViewReviewInbox();
  const canViewMyComments = useCanViewMyComments();
  const canViewMyWork = useCanViewMyWork();
  const canViewSubmittals = useCanViewSubmittals();
  const canViewAuditLogs = useCanViewAuditLogs();
  const canManageUsers = useCanManageUsers();
  const canManageRoles = useCanManageRoles();
  const canViewDepartments = useCanViewDepartmentsNav();
  const canViewPositions = useCanViewDepartmentsNav();
  const canViewDisciplinesCatalog = useCanViewDisciplinesCatalogNav();

  const navItems = buildIconRailItems({
    canViewReviewInbox: !permLoading && canViewReviewInbox,
    canViewMyComments: !permLoading && canViewMyComments,
    canViewMyWork: !permLoading && canViewMyWork,
    canViewSubmittals: !permLoading && canViewSubmittals,
    canViewAuditLogs: !permLoading && canViewAuditLogs,
    canManageUsers: !permLoading && canManageUsers,
    canManageRoles: !permLoading && canManageRoles,
    canViewProjects: !permLoading && pm.projects.canView,
    canViewDepartments: !permLoading && canViewDepartments,
    canViewPositions: !permLoading && canViewPositions,
    canViewDisciplinesCatalog: !permLoading && canViewDisciplinesCatalog,
  });
  const visibleNavItems = navItems.filter(
    (item) => item.visible && canViewGlobalNavKey(item.key, epc),
  );
  const selectedKey = resolveIconRailKey(pathname, visibleNavItems);
  const profileActive = pathname === '/profile';

  async function handleLogout(): Promise<void> {
    try {
      await logout.mutateAsync();
    } catch {
      // swallowed; cleared below
    }
    // TanStack Query v5 global onSettled is not awaited by mutateAsync, so
    // call explicitly here to guarantee cache + auth are cleared before navigation.
    signOutLocally();
    onNavigate?.();
    router.replace('/login');
  }

  function handleToggleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onTogglePin?.();
    }
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{
        background: tokens.colorSidebarBg,
        borderRight: `0.5px solid ${tokens.colorBorder}`,
      }}
    >
      <div
        className={[
          'shrink-0 pb-4 pt-5',
          isExpanded ? 'px-3' : 'flex justify-center px-2',
        ].join(' ')}
      >
        {isExpanded ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-medium text-white"
              style={{ backgroundColor: tokens.colorSidebarAccent }}
              aria-hidden
            >
              {t('shell.brandShort')}
            </div>
            <h1
              className="truncate text-[14px] font-medium tracking-[-0.01em]"
              style={{ color: tokens.colorTextPrimary }}
            >
              {t('shell.brandTitle')}
            </h1>
          </div>
        ) : (
          <div
            className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[11px] font-medium text-white"
            style={{ backgroundColor: tokens.colorSidebarAccent }}
            title={t('shell.brandTitle')}
            aria-label={t('shell.brandWorkspace')}
          >
            {t('shell.brandShort')}
          </div>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: `0.5px solid ${tokens.colorBorder}` }} />

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        {permLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className={[
                'erp-page-skeleton rounded-lg',
                isExpanded ? 'h-9 w-full' : 'mx-auto h-8 w-8',
              ].join(' ')}
            />
          ))
        ) : (
          visibleNavItems.map((item) => (
            <RailNavButton
              key={item.key}
              item={item}
              label={t(item.labelKey)}
              isActive={selectedKey === item.key}
              isExpanded={isExpanded}
              onNavigate={onNavigate}
            />
          ))
        )}
      </nav>

      <div
        className="flex flex-col gap-0.5 px-2 pb-3 pt-2"
        style={{ borderTop: `0.5px solid ${tokens.colorBorder}` }}
      >
        <Link
          href="/profile"
          onClick={onNavigate}
          title={t('nav.profile')}
          aria-label={t('nav.profile')}
          aria-current={profileActive ? 'page' : undefined}
          className={[
            railItemClass(profileActive, isExpanded),
            !profileActive && isExpanded
              ? 'hover:bg-[var(--color-surface-secondary)]'
              : '',
            !profileActive && !isExpanded
              ? 'hover:bg-[var(--color-surface-secondary)]'
              : '',
          ].join(' ')}
          style={railItemStyle(profileActive)}
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
            style={{
              backgroundColor: tokens.colorBlue50,
              color: tokens.colorBlue800,
            }}
          >
            <UserOutlined className="text-[12px]" />
          </span>
          <span
            className={[
              'truncate transition-all duration-200 ease-in-out',
              isExpanded ? 'w-auto opacity-100' : 'w-0 overflow-hidden opacity-0',
            ].join(' ')}
          >
            {t('nav.profile')}
          </span>
        </Link>

        <RailActionButton
          label={logout.isPending ? t('nav.signingOut') : t('nav.logout')}
          icon={<LogoutOutlined />}
          isExpanded={isExpanded}
          onClick={() => void handleLogout()}
          disabled={logout.isPending}
        />

        {showPinToggle && onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            onKeyDown={handleToggleKeyDown}
            title={pinned ? t('shell.collapseNavigation') : t('shell.expandNavigation')}
            aria-label={pinned ? t('shell.collapseNavigation') : t('shell.expandNavigation')}
            aria-pressed={pinned}
            className={[
              'mt-0.5 flex h-8 shrink-0 items-center rounded-lg transition-colors hover:bg-[var(--color-surface-secondary)]',
              isExpanded ? 'w-full justify-end px-2.5' : 'mx-auto w-8 justify-center',
            ].join(' ')}
            style={{ color: tokens.colorTextTertiary }}
          >
            {pinned ? (
              <LeftOutlined className="text-[12px]" />
            ) : (
              <RightOutlined className="text-[12px]" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
