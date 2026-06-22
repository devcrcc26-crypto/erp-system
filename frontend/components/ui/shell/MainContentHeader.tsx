'use client';

import { MenuOutlined } from '@ant-design/icons';
import Breadcrumbs from '@/components/ui/shell/Breadcrumbs';
import HeaderActions from '@/components/ui/PageHeader/HeaderActions';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { BreadcrumbSegment } from '@/config/navConfig';

/**
 * Sticky main-content header — page title, breadcrumb trail, notifications, profile.
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
    <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white shadow-sm">
      {/* Mobile / tablet — single compact row */}
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-6 lg:hidden">
        {onOpenMobileNav && (
          <button
            type="button"
            onClick={onOpenMobileNav}
            onKeyDown={handleMobileNavKeyDown}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label={t('shell.openNavigation')}
          >
            <MenuOutlined style={{ fontSize: 17 }} />
          </button>
        )}

        <h1 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg">
          {pageTitle}
        </h1>

        <HeaderActions compact />
      </div>

      {/* Desktop — title, breadcrumbs, and actions */}
      <div className="hidden px-6 py-4 lg:flex lg:items-start lg:justify-between lg:gap-4 xl:px-8">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">
            {pageTitle}
          </h1>
          <div className="mt-1.5">
            <Breadcrumbs segments={breadcrumbs} />
          </div>
        </div>

        <HeaderActions />
      </div>
    </header>
  );
}
