'use client';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useState } from 'react';
import MainNavPanel from '@/components/ui/shell/MainNavPanel';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useRailExpanded } from '@/hooks/useRailExpanded';
import { tokens } from '@/lib/theme/tokens';
import {
  NAV_DOMAIN_RAIL_WIDTH,
  RAIL_COLLAPSED_WIDTH,
  RAIL_EXPANDED_WIDTH,
} from '@/components/ui/shell/shell-layout';

/**
 * Desktop sidebar shell. Hidden below lg — mobile uses MobileNavDrawer.
 * Expand/collapse lives under the icon rail only (not the module panel).
 * Width grows only while a module panel (HR, Organization, …) is visible.
 */
export default function IconRail(): React.ReactNode {
  const { isExpanded, toggleExpanded } = useRailExpanded();
  const { t } = useEpcTranslation();
  const [modulePanelVisible, setModulePanelVisible] = useState(false);

  const showSecondSidebar = isExpanded && modulePanelVisible;
  const layoutWidth = showSecondSidebar
    ? RAIL_EXPANDED_WIDTH
    : RAIL_COLLAPSED_WIDTH;

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
          <MainNavPanel
            isExpanded={isExpanded}
            onModulePanelVisibleChange={setModulePanelVisible}
          />
        </div>

        <div
          className="flex shrink-0"
          style={{
            borderTop: `1px solid ${tokens.colorSidebarBorder}`,
            background: tokens.colorSidebarRailBg,
          }}
        >
          <div
            className="flex items-center justify-center py-2"
            style={{
              width: NAV_DOMAIN_RAIL_WIDTH,
              borderRight: showSecondSidebar
                ? `1px solid ${tokens.colorSidebarBorder}`
                : undefined,
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
          {showSecondSidebar ? (
            <div
              className="min-w-0 flex-1"
              style={{ background: tokens.colorSidebarBg }}
              aria-hidden
            />
          ) : null}
        </div>
      </aside>
    </div>
  );
}
