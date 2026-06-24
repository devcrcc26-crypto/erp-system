// UI polish pass — styles only, no logic changes

'use client';

import { useEffect, useState } from 'react';
import MainNavPanel from '@/components/ui/shell/MainNavPanel';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useRailExpanded } from '@/hooks/useRailExpanded';
import { tokens } from '@/lib/theme/tokens';
import {
  RAIL_COLLAPSED_WIDTH,
  RAIL_EXPANDED_WIDTH,
  RAIL_PEEK_OVERLAY_WITH_CONTEXT,
} from '@/components/ui/shell/shell-layout';

const LG_BREAKPOINT_PX = 1024;

/**
 * Desktop icon rail with pin + hover-peek behaviour. Hidden below lg — use MainNavPanel in a drawer on mobile.
 */
export default function IconRail({
  coverContextSidebar = false,
}: {
  coverContextSidebar?: boolean;
}): React.ReactNode {
  const {
    pinned,
    isExpanded,
    layoutWidth,
    togglePinned,
    onPeekEnter,
    onPeekLeave,
  } = useRailExpanded();
  const { t } = useEpcTranslation();

  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT_PX}px)`);
    const sync = (): void => setIsDesktop(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  const isOverlayPeek = isExpanded && !pinned;
  const shouldCoverContext =
    isOverlayPeek && coverContextSidebar && isDesktop;

  const panelWidth = (() => {
    if (!isExpanded) {
      return RAIL_COLLAPSED_WIDTH;
    }
    if (shouldCoverContext) {
      return RAIL_PEEK_OVERLAY_WITH_CONTEXT;
    }
    return RAIL_EXPANDED_WIDTH;
  })();

  return (
    <div
      className="relative z-40 hidden h-full shrink-0 lg:block"
      style={{ width: layoutWidth }}
    >
      <aside
        onMouseEnter={onPeekEnter}
        onMouseLeave={onPeekLeave}
        className={[
          'flex h-full flex-col transition-[width] duration-200 ease-in-out',
          isOverlayPeek
            ? 'absolute left-0 top-0 z-50 border-r'
            : 'relative',
        ].join(' ')}
        style={{
          width: panelWidth,
          background: tokens.colorSidebarBg,
          borderColor: isOverlayPeek ? tokens.colorBorder : undefined,
        }}
        aria-label={t('shell.mainNavigation')}
      >
        <div
          className="flex h-full flex-col"
          style={{ maxWidth: RAIL_EXPANDED_WIDTH, width: '100%' }}
        >
          <MainNavPanel
            isExpanded={isExpanded}
            showPinToggle
            pinned={pinned}
            onTogglePin={togglePinned}
          />
        </div>
      </aside>
    </div>
  );
}
