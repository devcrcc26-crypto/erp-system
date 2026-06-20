'use client';

import Link from 'next/link';
import type { BreadcrumbSegment } from '@/config/navConfig';

/**
 * Route-driven breadcrumb trail for the main content pane.
 */
export default function Breadcrumbs({
  segments,
}: {
  segments: readonly BreadcrumbSegment[];
}): React.ReactNode {
  if (segments.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;

          return (
            <li key={`${segment.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && (
                <span className="text-slate-400" aria-hidden>
                  &gt;
                </span>
              )}
              {isLast || !segment.href ? (
                <span
                  className="truncate font-semibold text-slate-900"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {segment.label}
                </span>
              ) : (
                <Link
                  href={segment.href}
                  className="truncate transition-colors hover:text-slate-700"
                >
                  {segment.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
