'use client';

import { useMemo, useState } from 'react';
import { SearchOutlined } from '@ant-design/icons';
import type { IconRailItem } from '@/config/navConfig';
import NavItemLink from '@/components/ui/shell/nav/NavItemLink';
import type { NavDomain } from '@/components/ui/shell/nav/nav-domains';
import { tokens } from '@/lib/theme/tokens';
import {
  NAV_MODULE_PANEL_WIDTH,
  SHELL_TOP_HEADER_HEIGHT,
} from '@/components/ui/shell/shell-layout';

/** Module count above which the panel shows a filter box. */
const FILTER_THRESHOLD = 8;

/**
 * Lists the modules of the selected domain. Long domains (HR) get a filter box.
 */
export default function NavModulePanel({
  domain,
  selectedKey,
  onNavigate,
  t,
  width = NAV_MODULE_PANEL_WIDTH,
  showHeader = true,
  scrollMaxHeight,
}: {
  domain: NavDomain;
  selectedKey: string;
  onNavigate?: () => void;
  t: (key: string) => string;
  width?: number | string;
  /** Flyouts reuse the list without the domain title band. */
  showHeader?: boolean;
  /** Caps the list height when the panel is not in a full-height column. */
  scrollMaxHeight?: number | string;
}): React.ReactNode {
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();

  const items = useMemo(
    (): readonly IconRailItem[] =>
      query.length === 0
        ? domain.items
        : domain.items.filter((item) =>
            t(item.labelKey).toLowerCase().includes(query),
          ),
    [domain.items, query, t],
  );

  const showFilter = domain.items.length > FILTER_THRESHOLD;

  return (
    <div
      className="flex min-h-0 flex-col"
      style={{
        width,
        height: scrollMaxHeight === undefined ? '100%' : undefined,
        background: tokens.colorSidebarBg,
        borderLeft: showHeader
          ? `1px solid ${tokens.colorSidebarBorder}`
          : undefined,
      }}
      aria-label={t(domain.labelKey)}
    >
      {showHeader ? (
        <div
          className="flex shrink-0 items-end px-3 pb-2"
          style={{
            height: SHELL_TOP_HEADER_HEIGHT,
            borderBottom: `1px solid ${tokens.colorSidebarBorder}`,
          }}
        >
          <h2
            className="m-0 truncate text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{
              color: tokens.colorSidebarTextMuted,
              fontFamily: tokens.fontFamily,
            }}
          >
            {t(domain.labelKey)}
          </h2>
        </div>
      ) : null}

      {showFilter ? (
        <div className="shrink-0 px-2 pb-1 pt-2">
          <label
            className="flex h-8 items-center gap-2 rounded-[6px] px-2.5"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: `1px solid ${tokens.colorSidebarBorder}`,
            }}
          >
            <SearchOutlined
              className="shrink-0 text-[12px]"
              style={{ color: tokens.colorSidebarIcon }}
            />
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('shell.searchNavigation')}
              aria-label={t('shell.searchNavigation')}
              className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:opacity-60"
              style={{
                color: tokens.colorSidebarTextActive,
                fontFamily: tokens.fontFamily,
              }}
            />
          </label>
        </div>
      ) : null}

      <div
        className="erp-main-nav-scroll flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 py-2"
        style={{ maxHeight: scrollMaxHeight }}
      >
        {items.map((item) => (
          <NavItemLink
            key={item.key}
            item={item}
            label={t(item.labelKey)}
            isActive={selectedKey === item.key}
            onNavigate={onNavigate}
          />
        ))}

        {items.length === 0 ? (
          <p
            className="px-2 py-3 text-[12px]"
            style={{
              color: tokens.colorSidebarTextMuted,
              fontFamily: tokens.fontFamily,
            }}
          >
            {t('shell.noNavResults')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
