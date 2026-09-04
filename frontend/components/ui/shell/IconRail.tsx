'use client';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import MainNavPanel from '@/components/ui/shell/MainNavPanel';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useRailExpanded } from '@/hooks/useRailExpanded';
import { tokens } from '@/lib/theme/tokens';
import { RAIL_EXPANDED_WIDTH } from '@/components/ui/shell/shell-layout';

/**
 * Desktop sidebar shell. Hidden below lg — mobile uses MobileNavDrawer.
 */
export default function IconRail(): React.ReactNode {
  const { isExpanded, layoutWidth, toggleExpanded } = useRailExpanded();
  const { t } = useEpcTranslation();

  const toggleLabel = isExpanded
    ? t('shell.collapseNavigation')
    : t('shell.expandNavigation');

  return (
    <div
      className="relative z-40 hidden h-full shrink-0 lg:block"
      style={{ width: layoutWidth }}
    >
      <aside
        className="relative flex h-full flex-col overflow-hidden transition-[width] duration-200 ease-in-out"
        style={{
          width: layoutWidth,
          maxWidth: RAIL_EXPANDED_WIDTH,
          background: tokens.colorSidebarBg,
          borderRight: `1px solid ${tokens.colorSidebarBorder}`,
        }}
        aria-label={t('shell.mainNavigation')}
      >
        <div className="min-h-0 flex-1">
          <MainNavPanel isExpanded={isExpanded} />
        </div>

        <div
          className="flex shrink-0 items-center justify-center py-2"
          style={{
            borderTop: `1px solid ${tokens.colorSidebarBorder}`,
            background: tokens.colorSidebarBg,
          }}
        >
          <Tooltip title={toggleLabel} placement="right">
            <button
              type="button"
              onClick={toggleExpanded}
              aria-label={toggleLabel}
              aria-pressed={isExpanded}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent transition-colors hover:bg-[var(--color-sidebar-hover)]"
              style={{ color: tokens.colorSidebarIcon }}
            >
              {isExpanded ? (
                <LeftOutlined style={{ fontSize: 12 }} />
              ) : (
                <RightOutlined style={{ fontSize: 12 }} />
              )}
            </button>
          </Tooltip>
        </div>
      </aside>
    </div>
  );
}
