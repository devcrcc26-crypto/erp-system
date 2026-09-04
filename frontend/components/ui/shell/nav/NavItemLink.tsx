'use client';

import Link from 'next/link';
import type { IconRailItem } from '@/config/navConfig';
import { getNavIcon, navIconClassName } from '@/lib/navigation/nav-icons';
import { tokens } from '@/lib/theme/tokens';

/**
 * One module row inside the module panel or a collapsed-rail flyout.
 */
export default function NavItemLink({
  item,
  label,
  isActive,
  onNavigate,
}: {
  item: IconRailItem;
  label: string;
  isActive: boolean;
  onNavigate?: () => void;
}): React.ReactNode {
  const badge = item.badge ?? 0;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={[
        'group relative flex h-9 shrink-0 items-center gap-2.5 rounded-lg pl-3 pr-2 text-[13px] no-underline',
        'transition-colors duration-150',
        isActive
          ? 'font-semibold'
          : 'font-medium hover:bg-[var(--color-sidebar-hover)]',
      ].join(' ')}
      style={{
        backgroundColor: isActive ? tokens.colorSidebarActive : undefined,
        color: isActive
          ? tokens.colorSidebarTextActive
          : tokens.colorSidebarText,
        fontFamily: tokens.fontFamily,
      }}
    >
      {isActive ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full"
          style={{ background: tokens.colorSidebarAccent }}
        />
      ) : null}

      <span
        className={navIconClassName}
        style={{
          color: isActive ? tokens.colorSidebarAccent : tokens.colorSidebarIcon,
          fontSize: 15,
        }}
      >
        {getNavIcon(item.iconKey)}
      </span>

      <span className="min-w-0 flex-1 truncate">{label}</span>

      {badge > 0 ? (
        <span
          className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
          style={{ background: tokens.colorRed600, color: '#FFFFFF' }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  );
}
