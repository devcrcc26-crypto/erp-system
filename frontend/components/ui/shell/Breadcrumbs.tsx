// UI polish pass - styles only, no logic changes

'use client';

import Link from 'next/link';
import { Breadcrumb } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { BreadcrumbSegment } from '@/config/navConfig';

/**
 * Splits route crumbs into navigable parents and the current page label.
 */
export function splitBreadcrumbTrail(segments: readonly BreadcrumbSegment[]): {
  parents: BreadcrumbSegment[];
  current: BreadcrumbSegment | null;
} {
  if (segments.length === 0) {
    return { parents: [], current: null };
  }
  if (segments.length === 1) {
    return { parents: [], current: segments[0] ?? null };
  }
  return {
    parents: segments.slice(0, -1),
    current: segments[segments.length - 1] ?? null,
  };
}

/**
 * Full route breadcrumb trail, including the current page as the last item.
 */
export default function Breadcrumbs({
  segments,
}: {
  segments: readonly BreadcrumbSegment[];
}): React.ReactNode {
  const { t } = useEpcTranslation();

  if (segments.length === 0) {
    return null;
  }

  const items = segments.map((segment, index) => {
    const isLast = index === segments.length - 1;
    const isHome = segment.href === '/';

    if (isLast) {
      return {
        key: `${segment.label}-${index}`,
        title: (
          <span className="text-[var(--color-text-primary)] font-medium">
            {segment.label}
          </span>
        ),
      };
    }

    if (!segment.href) {
      return {
        key: `${segment.label}-${index}`,
        title: (
          <span className="text-[var(--color-text-secondary)]">
            {segment.label}
          </span>
        ),
      };
    }

    return {
      key: `${segment.label}-${index}`,
      title: (
        <Link href={segment.href} className="shell-breadcrumb-link">
          {isHome ? (
            <span className="inline-flex items-center gap-1.5">
              <HomeOutlined className="text-xs" aria-hidden />
              <span>{segment.label}</span>
            </span>
          ) : (
            segment.label
          )}
        </Link>
      ),
    };
  });

  return (
    <nav aria-label={t('shell.breadcrumb')} className="shell-breadcrumbs min-w-0">
      <Breadcrumb items={items} className="shell-breadcrumb" />
    </nav>
  );
}
