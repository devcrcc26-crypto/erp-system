// UI polish pass - styles only, no logic changes

'use client';

import { MenuOutlined } from '@ant-design/icons';
import Breadcrumbs from '@/components/ui/shell/Breadcrumbs';
import HeaderActions from '@/components/ui/PageHeader/HeaderActions';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { BreadcrumbSegment } from '@/config/navConfig';
import { tokens } from '@/lib/theme/tokens';
import { SHELL_TOP_HEADER_HEIGHT } from '@/components/ui/shell/shell-layout';

/**
 * Shell chrome: sticky actions header + sticky breadcrumbs second header.
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
          className="hidden items-center justify-between gap-4 px-6 lg:flex"
          style={{ height: SHELL_TOP_HEADER_HEIGHT }}
        >
          <h2
            className="m-0 truncate text-lg font-semibold"
            style={{
              color: tokens.colorTextPrimary,
              fontFamily: tokens.fontFamily,
            }}
          >
            {pageTitle} 
          </h2>
          <HeaderActions />
        </div>
      </header>

      {showBreadcrumbBar ? (
        <header
          className="sticky z-30 shrink-0 bg-white px-3 py-2 sm:px-4 lg:px-6"
          style={{
            top: SHELL_TOP_HEADER_HEIGHT,
            borderBottom: `1px solid ${tokens.colorBorder}`,
          }}
        >
          <Breadcrumbs segments={breadcrumbs} />
        </header>
      ) : null}
    </>
  );
}
