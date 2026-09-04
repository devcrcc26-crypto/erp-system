'use client';

import { MenuOutlined } from '@ant-design/icons';
import BrandLogo from '@/components/ui/BrandLogo/BrandLogo';
import Breadcrumbs from '@/components/ui/shell/Breadcrumbs';
import HeaderActions from '@/components/ui/PageHeader/HeaderActions';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { BreadcrumbSegment } from '@/config/navConfig';
import { useHeaderExtraStore } from '@/stores/header-extra.store';
import { SHELL_TOP_HEADER_HEIGHT } from '@/components/ui/shell/shell-layout';

/**
 * Shell chrome: sticky page title header + optional breadcrumb strip.
 * Matches Users / profile design language (soft borders, teal accents).
 */
export default function MainContentHeader({
  breadcrumbs,
  pageTitle,
  pageSubtitle,
  onOpenMobileNav,
}: {
  breadcrumbs: readonly BreadcrumbSegment[];
  pageTitle: string;
  pageSubtitle?: string;
  onOpenMobileNav?: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const headerExtra = useHeaderExtraStore((state) => state.extra);
  const showBreadcrumbBar = breadcrumbs.length > 0;

  function handleMobileNavKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
  ): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenMobileNav?.();
    }
  }

  return (
    <>
      <header className="erp-shell-header sticky top-0 z-30 shrink-0">
        <div
          className="erp-shell-header-bar erp-shell-header-bar--mobile flex items-center gap-2.5 px-3 lg:hidden"
          style={{ height: SHELL_TOP_HEADER_HEIGHT }}
        >
          {onOpenMobileNav ? (
            <button
              type="button"
              onClick={onOpenMobileNav}
              onKeyDown={handleMobileNavKeyDown}
              className="erp-shell-header-menu-btn"
              aria-label={t('shell.openNavigation')}
            >
              <MenuOutlined style={{ fontSize: 15 }} />
            </button>
          ) : null}

          <BrandLogo size={28} className="shrink-0 rounded-[8px] lg:hidden" />

          <div className="erp-shell-header-titles min-w-0 flex-1">
            <h1 className="erp-shell-header-title erp-shell-header-title--mobile">
              {pageTitle}
            </h1>
            {pageSubtitle ? (
              <p className="erp-shell-header-subtitle">{pageSubtitle}</p>
            ) : null}
          </div>

          <div className="erp-shell-header-actions flex shrink-0 items-center gap-1.5">
            {headerExtra ? (
              <div className="erp-shell-header-extra">{headerExtra}</div>
            ) : null}
            <HeaderActions compact />
          </div>
        </div>

        <div
          className="erp-shell-header-bar erp-shell-header-bar--desktop hidden items-center justify-between gap-4 px-6 lg:flex"
          style={{ height: SHELL_TOP_HEADER_HEIGHT }}
        >
          <div className="erp-shell-header-titles min-w-0 flex-1">
            <h2 className="erp-shell-header-title">{pageTitle}</h2>
            {pageSubtitle ? (
              <p className="erp-shell-header-subtitle">{pageSubtitle}</p>
            ) : null}
          </div>
          <div className="erp-shell-header-actions flex shrink-0 items-center gap-2">
            {headerExtra ? (
              <div className="erp-shell-header-extra">{headerExtra}</div>
            ) : null}
            <HeaderActions />
          </div>
        </div>
      </header>

      {showBreadcrumbBar ? (
        <header
          className="erp-shell-breadcrumb-bar sticky z-30 shrink-0 px-3 py-2 sm:px-4 lg:px-6"
          style={{ top: SHELL_TOP_HEADER_HEIGHT }}
        >
          <Breadcrumbs segments={breadcrumbs} />
        </header>
      ) : null}
    </>
  );
}
