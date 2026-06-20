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
  onOpenContextNav,
  showContextNavToggle = false,
}: {
  breadcrumbs: readonly BreadcrumbSegment[];
  pageTitle: string;
  onOpenContextNav?: () => void;
  showContextNavToggle?: boolean;
}): React.ReactNode {
  function handleToggleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenContextNav?.();
    }
  }

  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 px-6 py-4 md:px-8">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {showContextNavToggle && onOpenContextNav && (
            <button
              type="button"
              onClick={onOpenContextNav}
              onKeyDown={handleToggleKeyDown}
              className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 lg:hidden"
              aria-label="Open project navigation"
            >
              <MenuOutlined style={{ fontSize: 18 }} />
            </button>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
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
