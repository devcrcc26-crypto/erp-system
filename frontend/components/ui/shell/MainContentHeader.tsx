// UI polish pass - styles only, no logic changes

'use client';

import { MenuOutlined } from '@ant-design/icons';
import Breadcrumbs from '@/components/ui/shell/Breadcrumbs';
import HeaderActions from '@/components/ui/PageHeader/HeaderActions';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { BreadcrumbSegment } from '@/config/navConfig';
import { tokens } from '@/lib/theme/tokens';

/**
 * Sticky main-content header - page title, breadcrumb trail, notifications, profile.
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

  function handleMobileNavKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
  ): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenMobileNav?.();
    }
  }

  return (
    <header
      className="sticky top-0 z-20 shrink-0 bg-white"
      style={{ borderBottom: `0.5px solid ${tokens.colorBorder}` }}
    >
      {/* Mobile / tablet - single compact row */}
      <div className="flex h-[52px] items-center gap-2 px-3 lg:hidden">
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

        <h1
          className="min-w-0 flex-1 truncate text-[18px] font-medium tracking-[-0.01em]"
          style={{ color: tokens.colorTextPrimary }}
        >
          {pageTitle}
        </h1>

        <HeaderActions compact />
      </div>

      {/* Desktop - title, breadcrumbs, and actions */}
      <div className="hidden min-h-[52px] items-center justify-between gap-4 px-6 py-3 lg:flex xl:px-6">
        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-[18px] font-medium tracking-[-0.01em]"
            style={{ color: tokens.colorTextPrimary }}
          >
            {pageTitle}
          </h1>
          <div className="mt-1">
            <Breadcrumbs segments={breadcrumbs} />
          </div>
        </div>

        <HeaderActions />
      </div>
    </header>
  );
}
