'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  DashboardOutlined,
  ProjectOutlined,
  UnorderedListOutlined,
  TeamOutlined,
  BarChartOutlined,
  MailOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  InboxOutlined,
  CommentOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import {
  buildIconRailItems,
  resolveIconRailKey,
  type IconRailItem,
} from '@/config/navConfig';
import {
  useCanViewMyComments,
  useCanViewReviewInbox,
} from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useRailExpanded } from '@/hooks/useRailExpanded';
import { useLogout } from '@/lib/query/auth';
import { signOutLocally } from '@/lib/auth/sign-out-locally';
import { tokens } from '@/lib/theme/tokens';
import {
  RAIL_COLLAPSED_WIDTH,
  RAIL_EXPANDED_WIDTH,
  RAIL_PEEK_OVERLAY_WITH_CONTEXT,
} from '@/components/ui/shell/shell-layout';

const LG_BREAKPOINT_PX = 1024;

const RAIL_ICONS: Record<string, React.ReactNode> = {
  dashboard: <DashboardOutlined />,
  projects: <ProjectOutlined />,
  'review-inbox': <InboxOutlined />,
  'my-comments': <CommentOutlined />,
  kanban: <UnorderedListOutlined />,
  users: <TeamOutlined />,
  teams: <TeamOutlined />,
  reports: <BarChartOutlined />,
  messages: <MailOutlined />,
  settings: <SettingOutlined />,
};

function railItemClass(isActive: boolean, isExpanded: boolean): string {
  const base = 'flex shrink-0 items-center transition-colors duration-150';
  if (isExpanded) {
    return [
      base,
      'w-full gap-4 border-l-4 py-4 pl-6 pr-6 text-sm',
      isActive ? 'font-semibold text-white' : 'font-normal hover:text-white',
    ].join(' ');
  }
  return [
    base,
    'mx-auto h-10 w-10 justify-center text-base',
    isActive ? 'text-white' : 'hover:text-white',
  ].join(' ');
}

function railItemStyle(isActive: boolean, isExpanded: boolean): React.CSSProperties {
  if (isActive) {
    return {
      backgroundColor: tokens.colorSidebarActive,
      borderLeftColor: isExpanded ? tokens.colorSidebarAccent : 'transparent',
      color: tokens.colorSidebarTextActive,
    };
  }
  return {
    borderLeftColor: 'transparent',
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
      className={railItemClass(isActive, isExpanded)}
      style={{
        ...railItemStyle(isActive, isExpanded),
        ...(isActive && !isExpanded
          ? { backgroundColor: tokens.colorSidebarActive, borderRadius: 6 }
          : {}),
      }}
    >
      <span className="flex shrink-0 items-center justify-center leading-none">
        {RAIL_ICONS[item.iconKey] ?? <ProjectOutlined />}
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
          ? 'w-full gap-4 border-l-4 border-transparent py-4 pl-6 pr-6 text-sm font-normal hover:text-white'
          : 'mx-auto h-10 w-10 justify-center text-base hover:text-white',
      ].join(' ')}
      style={{ color: tokens.colorSidebarText }}
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
 * Collapsible icon rail with pin + hover-peek behaviour.
 */
export default function IconRail({
  coverContextSidebar = false,
}: {
  /** When true, hover-peek overlays the adjacent context sidebar on desktop. */
  coverContextSidebar?: boolean;
}): React.ReactNode {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();
  const { t } = useEpcTranslation();
  const canViewReviewInbox = useCanViewReviewInbox();
  const canViewMyComments = useCanViewMyComments();

  const {
    pinned,
    isExpanded,
    layoutWidth,
    togglePinned,
    onPeekEnter,
    onPeekLeave,
  } = useRailExpanded();

  const navItems = buildIconRailItems(canViewReviewInbox, canViewMyComments);
  const visibleNavItems = navItems.filter((item) => item.visible);
  const selectedKey = resolveIconRailKey(pathname, visibleNavItems);
  const profileActive = pathname === '/profile';
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT_PX}px)`);
    const sync = (): void => setIsDesktop(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  async function handleLogout(): Promise<void> {
    try {
      await logout.mutateAsync();
    } catch {
      signOutLocally();
    }
    router.replace('/login');
  }

  function handleToggleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      togglePinned();
    }
  }

  const isOverlayPeek = isExpanded && !pinned;
  const shouldCoverContext =
    isOverlayPeek && coverContextSidebar && isDesktop;

  const panelWidth = (() => {
    if (!isExpanded) {
      return RAIL_COLLAPSED_WIDTH;
    }
    if (shouldCoverContext) {
      return RAIL_PEEK_OVERLAY_WITH_CONTEXT;
    }
    return RAIL_EXPANDED_WIDTH;
  })();

  return (
    <div
      className="relative z-40 h-full shrink-0"
      style={{ width: layoutWidth }}
    >
      <aside
        onMouseEnter={onPeekEnter}
        onMouseLeave={onPeekLeave}
        className={[
          'flex h-full flex-col transition-[width] duration-200 ease-in-out',
          isOverlayPeek ? 'absolute left-0 top-0 z-50 shadow-xl' : 'relative',
        ].join(' ')}
        style={{ width: panelWidth, background: tokens.colorSidebarBg }}
        aria-label="Main navigation"
      >
        <div
          className="flex h-full flex-col"
          style={{ maxWidth: RAIL_EXPANDED_WIDTH, width: '100%' }}
        >
        <div
          className={[
            'shrink-0 pb-5 pt-8',
            isExpanded ? 'px-7' : 'flex justify-center px-3',
          ].join(' ')}
        >
          {isExpanded ? (
            <h1 className="truncate text-xl font-bold tracking-wide text-white">
              CCECC PWF
            </h1>
          ) : (
            <div
              className="flex h-8 w-8 items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: tokens.colorSidebarAccent, borderRadius: 6 }}
              title="CCECC PWF"
              aria-label="CCECC PWF workspace"
            >
              CP
            </div>
          )}
        </div>

        <hr className="border-slate-700" />

        <nav className="flex flex-1 flex-col overflow-hidden py-1">
          {visibleNavItems.map((item) => (
            <RailNavButton
              key={item.key}
              item={item}
              label={t(item.labelKey)}
              isActive={selectedKey === item.key}
              isExpanded={isExpanded}
            />
          ))}
        </nav>

        <div className="flex flex-col pb-2">
          <Link
            href="/profile"
            title={t('nav.profile')}
            aria-label={t('nav.profile')}
            aria-current={profileActive ? 'page' : undefined}
            className={railItemClass(profileActive, isExpanded)}
            style={{
              ...railItemStyle(profileActive, isExpanded),
              ...(profileActive && !isExpanded
                ? { backgroundColor: tokens.colorSidebarActive, borderRadius: 6 }
                : {}),
            }}
          >
            <span className="flex shrink-0 items-center justify-center leading-none">
              <UserOutlined />
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

          <button
            type="button"
            onClick={togglePinned}
            onKeyDown={handleToggleKeyDown}
            title={pinned ? 'Collapse navigation' : 'Expand navigation'}
            aria-label={pinned ? 'Collapse navigation' : 'Expand navigation'}
            aria-pressed={pinned}
            className={[
              'mt-1 flex h-8 shrink-0 items-center transition-colors hover:text-white',
              isExpanded ? 'w-full justify-end px-6' : 'mx-auto w-8 justify-center',
            ].join(' ')}
            style={{ color: tokens.colorSidebarText }}
          >
            {pinned ? (
              <LeftOutlined className="text-xs" />
            ) : (
              <RightOutlined className="text-xs" />
            )}
          </button>
        </div>
        </div>
      </aside>
    </div>
  );
}
