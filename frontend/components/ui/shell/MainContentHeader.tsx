// UI polish pass - styles only, no logic changes

'use client';

import { MenuOutlined } from '@ant-design/icons';
import Breadcrumbs from '@/components/ui/shell/Breadcrumbs';
import HeaderActions from '@/components/ui/PageHeader/HeaderActions';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { BreadcrumbSegment } from '@/config/navConfig';
import { useHeaderExtraStore } from '@/stores/header-extra.store';
import { tokens } from '@/lib/theme/tokens';
import { SHELL_TOP_HEADER_HEIGHT } from '@/components/ui/shell/shell-layout';

/**
 * Shell chrome: sticky actions header + sticky breadcrumb/title second header.
 */
export default function MainContentHeader({
  breadcrumbs,
  pageTitle,
  onOpenMobileNav,
}: {
  breadcrumbs: readonly BreadcrumbSegment[];
  pageTitle: string;
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
      <header
        className="sticky top-0 z-30 shrink-0 bg-white"
        style={{ borderBottom: `1px solid ${tokens.colorBorder}` }}
      >
        <div
          className="flex items-center gap-2 px-3 lg:hidden"
          style={{ height: SHELL_TOP_HEADER_HEIGHT }}
        >
          {onOpenMobileNav && (
            <button
              type="button"
              onClick={onOpenMobileNav}
              onKeyDown={handleMobileNavKeyDown}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-surface-secondary)]"
              style={{
                border: `0.5px solid ${tokens.colorBorder}`,
                color: tokens.colorTextSecondary,
              }}
              aria-label={t('shell.openNavigation')}
            >
              <MenuOutlined style={{ fontSize: 16 }} />
            </button>
          )}

          <div className="min-w-0 flex-1">
            <h1
              className="m-0 truncate text-[16px] font-semibold leading-tight tracking-tight"
              style={{
                color: tokens.colorTextPrimary,
                fontFamily: tokens.fontFamily,
              }}
            >
              {pageTitle}
            </h1>
          </div>

          <HeaderActions compact />
        </div>

        <div
          className="hidden items-center justify-end gap-4 px-6 lg:flex"
          style={{ height: SHELL_TOP_HEADER_HEIGHT }}
        >
          <HeaderActions />
        </div>
      </header>

      <header>

        
        {showBreadcrumbBar ? (
          <div
          className={`sticky z-20 shrink-0 bg-white px-3 py-2 sm:px-4 lg:px-6 ${
            !showBreadcrumbBar && !headerExtra ? 'hidden lg:block' : ''
          }`}
          style={{
            top: SHELL_TOP_HEADER_HEIGHT,
            borderBottom: `1px solid ${tokens.colorBorder}`,
          }}
          >
            <Breadcrumbs segments={breadcrumbs} />
          </div>
        ) : null}
        <div className="sticky z-20 shrink-0  px-3 py-2 sm:px-4 lg:px-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          {/* <h1
            className="m-0 hidden text-[20px] font-semibold leading-[32px] tracking-tight lg:block"
            style={{
              color: tokens.colorTextPrimary,
              fontFamily: tokens.fontFamily,
            }}
          >
            {pageTitle}
          </h1> */}
          {headerExtra ? (
            <div className="flex shrink-0 items-center sm:ml-auto">
              {headerExtra}
            </div>
          ) : null}
        </div>
      </header>
    </>
  );
}
