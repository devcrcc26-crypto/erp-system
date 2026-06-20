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
 * Shared main navigation panel — icon rail (desktop) and drawer (mobile).
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
  const canViewReviewInbox = useCanViewReviewInbox();
  const canViewMyComments = useCanViewMyComments();

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
      style={{ background: tokens.colorSidebarBg }}
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

      <nav className="flex flex-1 flex-col overflow-y-auto py-1">
        {visibleNavItems.map((item) => (
          <RailNavButton
            key={item.key}
            item={item}
            label={t(item.labelKey)}
            isActive={selectedKey === item.key}
            isExpanded={isExpanded}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="flex flex-col pb-2">
        <Link
          href="/profile"
          onClick={onNavigate}
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

        {showPinToggle && onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
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
        )}
      </div>
    </div>
  );
}
