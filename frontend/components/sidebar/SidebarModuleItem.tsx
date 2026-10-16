'use client';

import Link from 'next/link';
import { Tooltip } from 'antd';
import { Star } from 'lucide-react';
import type { SidebarLink } from '@/components/sidebar/sidebar-model';
import SidebarBadge from '@/components/sidebar/SidebarBadge';
import { getNavIcon } from '@/lib/navigation/nav-icons';

export interface SidebarFavoriteControl {
  readonly pinned: boolean;
  /** False when the favorites list is full and this item is not in it. */
  readonly canPin: boolean;
  readonly onToggle: () => void;
  readonly pinLabel: string;
  readonly unpinLabel: string;
  readonly fullLabel: string;
}

/**
 * One destination inside a module group (or a search result). Coming-soon
 * placeholders render as static text - they are never focusable links.
 */
export default function SidebarModuleItem({
  link,
  label,
  active,
  onNavigate,
  context,
  badgeCount = 0,
  badgeLabel = '',
  favorite,
  comingSoonLabel,
  searchResult = false,
}: {
  link: SidebarLink;
  label: string;
  active: boolean;
  onNavigate?: () => void;
  /** Secondary line, e.g. "Human Resources › Time & Leave" in search results. */
  context?: string;
  badgeCount?: number;
  badgeLabel?: string;
  favorite?: SidebarFavoriteControl;
  comingSoonLabel: string;
  /** Marks the link for arrow-key navigation within search results. */
  searchResult?: boolean;
}): React.ReactNode {
  const icon = <span className="sb-icon">{getNavIcon(link.icon)}</span>;

  if (link.href === null) {
    return (
      <li className="sb-item">
        <div className="sb-row sb-row--static erp-sidebar-module-link">
          {icon}
          <span className="sb-row-label">{label}</span>
          <span className="sb-soon">{comingSoonLabel}</span>
        </div>
      </li>
    );
  }

  return (
    <li className="sb-item" data-pinned={favorite?.pinned ? 'true' : undefined}>
      <Link
        href={link.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className="sb-selectable sb-row erp-sidebar-module-link"
        data-sidebar-result={searchResult ? '' : undefined}
      >
        {icon}
        <span className="sb-row-label">
          <span className="sb-row-text">{label}</span>
          {context ? <span className="sb-row-context">{context}</span> : null}
        </span>
        <SidebarBadge count={badgeCount} label={badgeLabel} />
      </Link>

      {favorite ? <FavoriteToggle control={favorite} /> : null}
    </li>
  );
}

function FavoriteToggle({
  control,
}: {
  control: SidebarFavoriteControl;
}): React.ReactNode {
  const blocked = !control.pinned && !control.canPin;
  const actionLabel = control.pinned ? control.unpinLabel : control.pinLabel;

  return (
    <Tooltip
      title={blocked ? control.fullLabel : actionLabel}
      placement="right"
      trigger={['hover', 'focus']}
      mouseEnterDelay={0.4}
    >
      <button
        type="button"
        className="sb-pin"
        aria-pressed={control.pinned}
        aria-disabled={blocked || undefined}
        aria-label={blocked ? `${actionLabel}. ${control.fullLabel}` : actionLabel}
        onClick={() => {
          if (!blocked) {
            control.onToggle();
          }
        }}
      >
        <Star
          aria-hidden
          size={15}
          strokeWidth={1.9}
          fill={control.pinned ? 'currentColor' : 'none'}
        />
      </button>
    </Tooltip>
  );
}
