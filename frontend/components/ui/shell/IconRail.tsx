// UI polish pass - styles only, no logic changes

'use client';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import MainNavPanel from '@/components/ui/shell/MainNavPanel';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useRailExpanded } from '@/hooks/useRailExpanded';
import { tokens } from '@/lib/theme/tokens';
import {
  RAIL_EXPANDED_WIDTH,
  SHELL_TOP_HEADER_HEIGHT,
} from '@/components/ui/shell/shell-layout';

const COLLAPSE_BUTTON_SIZE = 24;

/**
 * Desktop icon rail. Hidden below lg — use MainNavPanel in a drawer on mobile.
 */
export default function IconRail(): React.ReactNode {
  const { isExpanded, layoutWidth, toggleExpanded } = useRailExpanded();
  const { t } = useEpcTranslation();

  function handleToggleKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
  ): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleExpanded();
    }
  }

  function handleToggleClick(event: React.MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    toggleExpanded();
  }

  return (
    <div
      className="relative z-40 hidden h-full shrink-0 overflow-visible lg:block"
      style={{ width: layoutWidth }}
    >
      <aside
        className="relative flex h-full flex-col transition-[width] duration-200 ease-in-out"
        style={{
          width: layoutWidth,
          background: tokens.colorSidebarBg,
        }}
        aria-label={t('shell.mainNavigation')}
      >
        <div
          className="flex h-full flex-col"
          style={{ maxWidth: RAIL_EXPANDED_WIDTH, width: '100%' }}
        >
          <MainNavPanel isExpanded={isExpanded} />
        </div>
      </aside>

      <button
        type="button"
        onClick={handleToggleClick}
        onKeyDown={handleToggleKeyDown}
        title={
          isExpanded
            ? t('shell.collapseNavigation')
            : t('shell.expandNavigation')
        }
        aria-label={
          isExpanded
            ? t('shell.collapseNavigation')
            : t('shell.expandNavigation')
        }
        aria-pressed={isExpanded}
        className="absolute z-[60] flex items-center justify-center rounded-full transition-colors hover:opacity-95"
        style={{
          top: SHELL_TOP_HEADER_HEIGHT + 10,
          left: layoutWidth - COLLAPSE_BUTTON_SIZE / 2,
          width: COLLAPSE_BUTTON_SIZE,
          height: COLLAPSE_BUTTON_SIZE,
          background: tokens.colorCardBg,
          color: tokens.colorTextSecondary,
          border: `1px solid ${tokens.colorBorder}`,
          boxShadow:
            '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.08)',
        }}
      >
        {isExpanded ? (
          <LeftOutlined style={{ fontSize: 11 }} />
        ) : (
          <RightOutlined style={{ fontSize: 11 }} />
        )}
      </button>
    </div>
  );
}
