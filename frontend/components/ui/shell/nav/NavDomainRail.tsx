'use client';

import Link from 'next/link';
import { Popover, Tooltip } from 'antd';
import type { NavDomain } from '@/components/ui/shell/nav/nav-domains';
import NavModulePanel from '@/components/ui/shell/nav/NavModulePanel';
import BrandLogo from '@/components/ui/BrandLogo/BrandLogo';
import { getNavIcon, navIconClassName } from '@/lib/navigation/nav-icons';
import { tokens } from '@/lib/theme/tokens';
import {
  NAV_DOMAIN_RAIL_WIDTH,
  NAV_MODULE_PANEL_WIDTH,
  SHELL_TOP_HEADER_HEIGHT,
} from '@/components/ui/shell/shell-layout';

function domainButtonClass(isSelected: boolean): string {
  return [
    'relative mx-auto flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center',
    'rounded-[10px] border-0 bg-transparent p-0 transition-colors duration-150',
    isSelected ? '' : 'hover:bg-[var(--color-sidebar-hover)]',
  ].join(' ');
}

function DomainIcon({
  iconKey,
  isSelected,
  hasBadge,
}: {
  iconKey: string;
  isSelected: boolean;
  hasBadge: boolean;
}): React.ReactNode {
  return (
    <>
      <span
        className={navIconClassName}
        style={{
          color: isSelected
            ? tokens.colorSidebarAccent
            : tokens.colorSidebarIcon,
          fontSize: 17,
        }}
      >
        {getNavIcon(iconKey)}
      </span>
      {hasBadge ? (
        <span
          aria-hidden
          className="absolute right-1 top-1 h-2 w-2 rounded-full"
          style={{
            background: tokens.colorRed600,
            boxShadow: `0 0 0 2px ${tokens.colorSidebarRailBg}`,
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Icon column listing every navigation domain. Expanded, a domain click swaps the
 * module panel; collapsed, it opens the same list as a flyout.
 */
export default function NavDomainRail({
  primary,
  utility,
  activeDomainKey,
  browsedDomainKey,
  selectedKey,
  isExpanded,
  showPanel,
  onBrowseDomain,
  onNavigate,
  t,
}: {
  primary: readonly NavDomain[];
  utility: readonly NavDomain[];
  activeDomainKey: string | null;
  browsedDomainKey: string | null;
  selectedKey: string;
  /** Prefer inline module panel over flyouts when true. */
  isExpanded: boolean;
  /** True when the module panel is visible beside the rail. */
  showPanel: boolean;
  onBrowseDomain: (key: string) => void;
  onNavigate?: () => void;
  t: (key: string) => string;
}): React.ReactNode {
  function renderDomain(domain: NavDomain): React.ReactNode {
    const label = t(domain.labelKey);
    const isActive = activeDomainKey === domain.key;
    const isBrowsed = browsedDomainKey === domain.key;
    const isSelected = isActive || (showPanel && isBrowsed);
    const hasBadge = domain.items.some((item) => (item.badge ?? 0) > 0);

    const highlight: React.CSSProperties = isSelected
      ? { background: tokens.colorSidebarActive }
      : {};

    const activeTick = isActive ? (
      <span
        aria-hidden
        className="absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
        style={{ background: tokens.colorSidebarAccent }}
      />
    ) : null;

    if (domain.href !== null) {
      return (
        <Tooltip
          key={domain.key}
          title={label}
          placement="right"
          mouseEnterDelay={0.2}
        >
          <Link
            href={domain.href}
            onClick={onNavigate}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            className={domainButtonClass(isSelected)}
            style={highlight}
          >
            {activeTick}
            <DomainIcon
              iconKey={domain.iconKey}
              isSelected={isSelected}
              hasBadge={hasBadge}
            />
          </Link>
        </Tooltip>
      );
    }

    const button = (
      <button
        type="button"
        onClick={() => onBrowseDomain(domain.key)}
        aria-label={label}
        aria-expanded={showPanel ? isBrowsed : undefined}
        className={domainButtonClass(isSelected)}
        style={highlight}
      >
        {activeTick}
        <DomainIcon
          iconKey={domain.iconKey}
          isSelected={isSelected}
          hasBadge={hasBadge}
        />
      </button>
    );

    // Collapsed rail: flyout. Expanded: click opens/switches the inline panel
    // even when the current route has no second sidebar (e.g. Approvals).
    if (!isExpanded) {
      return (
        <Popover
          key={domain.key}
          trigger="click"
          placement="rightTop"
          arrow={false}
          content={
            <div
              className="overflow-hidden rounded-xl shadow-lg"
              style={{
                width: NAV_MODULE_PANEL_WIDTH,
                background: tokens.colorSidebarBg,
                border: `1px solid ${tokens.colorSidebarBorder}`,
              }}
            >
              <div
                className="px-3 py-2.5"
                style={{
                  borderBottom: `1px solid ${tokens.colorSidebarBorder}`,
                }}
              >
                <span
                  className="text-[13px] font-semibold tracking-tight"
                  style={{ color: tokens.colorSidebarText }}
                >
                  {label}
                </span>
              </div>
              <NavModulePanel
                domain={domain}
                selectedKey={selectedKey}
                onNavigate={onNavigate}
                t={t}
                width="100%"
                showHeader={false}
                scrollMaxHeight="60vh"
              />
            </div>
          }
          styles={{
            container: { padding: 0, background: 'transparent' },
            content: { padding: 0 },
          }}
        >
          {button}
        </Popover>
      );
    }

    return (
      <Tooltip
        key={domain.key}
        title={label}
        placement="right"
        mouseEnterDelay={0.2}
      >
        {button}
      </Tooltip>
    );
  }

  return (
    <div
      className="flex h-full shrink-0 flex-col"
      style={{
        width: NAV_DOMAIN_RAIL_WIDTH,
        background: tokens.colorSidebarRailBg,
        borderRight: `1px solid ${tokens.colorSidebarBorder}`,
      }}
    >
      <div
        className="flex shrink-0 items-center justify-center"
        style={{
          height: SHELL_TOP_HEADER_HEIGHT,
          borderBottom: `1px solid ${tokens.colorSidebarBorder}`,
        }}
      >
        <Tooltip title={t('shell.brandTitle')} placement="right">
          <Link
            href="/"
            onClick={onNavigate}
            aria-label={t('shell.brandWorkspace')}
            className="inline-flex"
          >
            <BrandLogo size={26} className="rounded-lg" />
          </Link>
        </Tooltip>
      </div>

      <nav
        className="erp-main-nav-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto py-3"
        aria-label={t('shell.mainNavigation')}
      >
        {primary.map(renderDomain)}
      </nav>

      {utility.length > 0 ? (
        <div
          className="flex shrink-0 flex-col gap-1.5 px-0 pb-2 pt-2"
          style={{ borderTop: `1px solid ${tokens.colorSidebarBorder}` }}
        >
          {utility.map(renderDomain)}
        </div>
      ) : null}
    </div>
  );
}
