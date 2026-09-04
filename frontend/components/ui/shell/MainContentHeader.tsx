'use client';

import { MenuOutlined } from '@ant-design/icons';
import Breadcrumbs from '@/components/ui/shell/Breadcrumbs';
import HeaderActions from '@/components/ui/PageHeader/HeaderActions';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { BreadcrumbSegment } from '@/config/navConfig';
import { useHeaderExtraStore } from '@/stores/header-extra.store';
import { SHELL_TOP_HEADER_HEIGHT } from '@/components/ui/shell/shell-layout';

/**
 * Sticky shell header — light chrome, single responsive layout.
 * Hamburger opens mobile nav only; desktop uses the sidebar logo + rail toggle.
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
  const showBreadcrumbs = breadcrumbs.length > 0;

  function handleMobileNavKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
  ): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenMobileNav?.();
    }
  }

  return (
    <header className="erp-shell-header sticky top-0 z-30 shrink-0">
      <div
        className="erp-shell-header-main"
        style={{ minHeight: SHELL_TOP_HEADER_HEIGHT }}
      >
        <div className="erp-shell-header-leading">
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

          <div className="erp-shell-header-titles min-w-0 flex-1">
            <h1 className="erp-shell-header-title">{pageTitle}</h1>
            {pageSubtitle ? (
              <p className="erp-shell-header-subtitle">{pageSubtitle}</p>
            ) : null}
          </div>
        </div>

        {headerExtra ? (
          <div className="erp-shell-header-extra">{headerExtra}</div>
        ) : null}

        <div className="erp-shell-header-trailing">
          <HeaderActions />
        </div>
      </div>

      {showBreadcrumbs ? (
        <div className="erp-shell-breadcrumb-bar">
          <Breadcrumbs segments={breadcrumbs} />
        </div>
      ) : null}
    </header>
  );
}
