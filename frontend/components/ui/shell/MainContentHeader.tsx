'use client';

import { MenuOutlined } from '@ant-design/icons';
import Breadcrumbs from '@/components/ui/shell/Breadcrumbs';
import HeaderActions from '@/components/ui/PageHeader/HeaderActions';
import type { BreadcrumbSegment } from '@/config/navConfig';

/**
 * Sticky main-content header — page title, breadcrumb trail, notifications, profile.
 */
export default function MainContentHeader({
  breadcrumbs,
  pageTitle,
  onOpenMainNav,
  onOpenContextNav,
  showContextNavToggle = false,
}: {
  breadcrumbs: readonly BreadcrumbSegment[];
  pageTitle: string;
  onOpenMainNav?: () => void;
  onOpenContextNav?: () => void;
  showContextNavToggle?: boolean;
}): React.ReactNode {
  function handleMainNavKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenMainNav?.();
    }
  }

  function handleContextNavKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenContextNav?.();
    }
  }

  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6 sm:py-4 md:px-8">
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
          <div className="flex shrink-0 items-center gap-1 lg:hidden">
            {onOpenMainNav && (
              <button
                type="button"
                onClick={onOpenMainNav}
                onKeyDown={handleMainNavKeyDown}
                className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="Open main navigation"
              >
                <MenuOutlined style={{ fontSize: 18 }} />
              </button>
            )}
            {showContextNavToggle && onOpenContextNav && (
              <button
                type="button"
                onClick={onOpenContextNav}
                onKeyDown={handleContextNavKeyDown}
                className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="Open project navigation"
              >
                <MenuOutlined style={{ fontSize: 18 }} />
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl md:text-2xl">
              {pageTitle}
            </h1>
            <div className="mt-1 md:mt-1.5">
              <Breadcrumbs segments={breadcrumbs} />
            </div>
          </div>
        </div>

        <HeaderActions />
      </div>
    </header>
  );
}
