'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Tooltip } from 'antd';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

interface Edges {
  left: boolean;
  right: boolean;
}

/** Tolerance for sub-pixel scroll positions. */
const EDGE_EPSILON = 2;

/**
 * Scrollbars are hidden app-wide, so a wide table gives no sign that more
 * columns sit off-screen. This wraps a horizontally scrolling table and shows
 * an edge shadow plus a chevron button on each side that has hidden content.
 */
export default function HorizontalScrollHint({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<Edges>({ left: false, right: false });

  /** The element that actually scrolls (DataTable wrapper or antd content). */
  const findScroller = useCallback((): HTMLElement | null => {
    const root = rootRef.current;
    if (!root) {
      return null;
    }
    const candidates = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.erp-table-scroll, .ant-table-content, .ant-table-body',
      ),
    );
    return (
      candidates.find((el) => el.scrollWidth > el.clientWidth + 1) ??
      candidates[0] ??
      null
    );
  }, []);

  const update = useCallback(() => {
    const el = findScroller();
    const next: Edges = el
      ? {
          left: el.scrollLeft > EDGE_EPSILON,
          right:
            el.scrollLeft < el.scrollWidth - el.clientWidth - EDGE_EPSILON,
        }
      : { left: false, right: false };
    setEdges((prev) =>
      prev.left === next.left && prev.right === next.right ? prev : next,
    );
  }, [findScroller]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    update();
    // `scroll` does not bubble; capture it from any scrolling descendant.
    root.addEventListener('scroll', update, true);
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(root);
    // Rows added / columns resized change the table width, not the wrapper.
    const mutationObserver = new MutationObserver(() => {
      root
        .querySelectorAll('table')
        .forEach((table) => resizeObserver.observe(table));
      update();
    });
    mutationObserver.observe(root, { childList: true, subtree: true });
    root
      .querySelectorAll('table')
      .forEach((table) => resizeObserver.observe(table));
    return () => {
      root.removeEventListener('scroll', update, true);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [update]);

  function scrollByPage(direction: 1 | -1): void {
    const el = findScroller();
    if (!el) {
      return;
    }
    el.scrollBy({
      left: direction * Math.max(160, el.clientWidth * 0.7),
      behavior: 'smooth',
    });
  }

  const buttonClass =
    'absolute top-1/2 z-[3] flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-[#e2e8f0] bg-white text-slate-600 shadow-[0_2px_8px_rgba(15,23,42,0.15)] transition hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D9E75]';

  return (
    <div ref={rootRef} className="relative min-w-0">
      {children}

      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 z-[2] w-10 bg-gradient-to-r from-[rgba(15,23,42,0.10)] to-transparent transition-opacity duration-200 ${
          edges.left ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 z-[2] w-10 bg-gradient-to-l from-[rgba(15,23,42,0.10)] to-transparent transition-opacity duration-200 ${
          edges.right ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {edges.left ? (
        <Tooltip title={t('common.scrollLeft')}>
          <button
            type="button"
            className={`${buttonClass} left-2`}
            aria-label={t('common.scrollLeft')}
            onClick={() => scrollByPage(-1)}
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
        </Tooltip>
      ) : null}
      {edges.right ? (
        <Tooltip title={t('common.scrollRight')}>
          <button
            type="button"
            className={`${buttonClass} right-2`}
            aria-label={t('common.scrollRight')}
            onClick={() => scrollByPage(1)}
          >
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}
