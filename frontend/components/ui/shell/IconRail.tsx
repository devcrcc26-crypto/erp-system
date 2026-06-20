'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
        'group flex h-10 shrink-0 items-center rounded-md transition-colors duration-150',
        isExpanded ? 'w-full gap-3 px-3' : 'mx-auto w-10 justify-center',
        isActive
          ? 'bg-slate-700 font-semibold text-white'
          : 'text-slate-400 hover:bg-slate-700 hover:text-white',
      ].join(' ')}
      style={isActive ? { borderLeft: `3px solid ${tokens.colorSidebarAccent}` } : undefined}
    >
      <span className="flex shrink-0 items-center justify-center text-base leading-none">
        {RAIL_ICONS[item.iconKey] ?? <ProjectOutlined />}
      </span>
      <span
        className={[
          'truncate text-sm font-medium transition-all duration-200 ease-in-out',
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
        'flex h-10 shrink-0 items-center rounded-md transition-colors duration-150 disabled:opacity-60',
        isExpanded ? 'w-full gap-3 px-3' : 'mx-auto w-10 justify-center',
        'text-slate-400 hover:bg-slate-700 hover:text-white',
      ].join(' ')}
    >
      <span className="flex shrink-0 items-center justify-center text-base leading-none">
        {icon}
      </span>
      <span
        className={[
          'truncate text-sm font-medium transition-all duration-200 ease-in-out',
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
export default function IconRail(): React.ReactNode {
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

  const panelWidth = isExpanded ? 220 : 64;
  const isOverlayPeek = isExpanded && !pinned;

  return (
    <div
      className="relative z-30 h-full shrink-0"
      style={{ width: layoutWidth }}
      onMouseEnter={onPeekEnter}
      onMouseLeave={onPeekLeave}
    >
      <aside
        className={[
          'flex h-full flex-col transition-[width] duration-200 ease-in-out',
          isOverlayPeek ? 'absolute left-0 top-0 z-40 shadow-xl' : 'relative',
        ].join(' ')}
        style={{ width: panelWidth, background: tokens.colorSidebarBg }}
        aria-label="Main navigation"
      >
        <div className="flex flex-col items-center px-3 pb-3 pt-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
            style={{ backgroundColor: tokens.colorPrimary }}
            title="CCECC PWF"
            aria-label="CCECC PWF workspace"
          >
            CP
          </div>
        </div>

        <hr className="mx-3 border-slate-700" />

        <nav className="flex flex-1 flex-col gap-1 overflow-hidden px-2 py-3">
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

        <div className="flex flex-col gap-1 px-2 pb-2">
          <Link
            href="/profile"
            title={t('nav.profile')}
            aria-label={t('nav.profile')}
            aria-current={profileActive ? 'page' : undefined}
            className={[
              'flex h-10 shrink-0 items-center rounded-md transition-colors duration-150 hover:bg-slate-700 hover:text-white',
              isExpanded ? 'w-full gap-3 px-3' : 'mx-auto w-10 justify-center',
              profileActive ? 'bg-slate-700 font-semibold text-white' : 'text-slate-400',
            ].join(' ')}
            style={
              profileActive
                ? { borderLeft: `3px solid ${tokens.colorSidebarAccent}` }
                : undefined
            }
          >
            <span className="flex shrink-0 items-center justify-center text-base leading-none">
              <UserOutlined />
            </span>
            <span
              className={[
                'truncate text-sm font-medium transition-all duration-200 ease-in-out',
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
              'mt-1 flex h-8 shrink-0 items-center rounded-md text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-300',
              isExpanded ? 'w-full justify-end px-3' : 'mx-auto w-8 justify-center',
            ].join(' ')}
          >
            {pinned ? (
              <LeftOutlined className="text-xs" />
            ) : (
              <RightOutlined className="text-xs" />
            )}
          </button>
        </div>
      </aside>
    </div>
  );
}
