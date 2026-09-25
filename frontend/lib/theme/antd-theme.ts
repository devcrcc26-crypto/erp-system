// UI polish pass - styles only, no logic changes

import type { ThemeConfig } from 'antd';
import { FONT_SIZE_BASE_PX, getFontScale } from './font-scale';
import { tokens } from './tokens';

function scaledPx(basePx: number, fontSizePx: number): number {
  return Math.round(basePx * getFontScale(fontSizePx));
}

/**
 * Builds an Ant Design theme for the given base font size.
 */
export function buildAntdTheme(fontSizePx: number = FONT_SIZE_BASE_PX): ThemeConfig {
  const fontSize = scaledPx(14, fontSizePx);
  const fontSizeSM = scaledPx(12, fontSizePx);
  const fontSizeLG = scaledPx(16, fontSizePx);

  return {
    token: {
      colorPrimary: tokens.colorPrimary,
      colorPrimaryHover: tokens.colorPrimaryHover,
      colorBgContainer: tokens.colorCardBg,
      colorBgLayout: tokens.colorPageBg,
      colorBorder: tokens.colorBorder,
      colorText: tokens.colorTextPrimary,
      colorTextSecondary: tokens.colorTextSecondary,
      colorTextTertiary: tokens.colorTextTertiary,
      colorSuccess: tokens.colorGreen400,
      colorWarning: tokens.colorAmber400,
      colorError: tokens.colorRed400,
      colorInfo: tokens.colorBlue400,
      borderRadius: tokens.borderRadius,
      borderRadiusLG: tokens.borderRadiusCard,
      fontSize,
      fontSizeSM,
      fontSizeLG,
      fontWeightStrong: 600,
      fontFamily: tokens.fontFamily,
      controlHeight: 32,
      lineHeight: 1.5714285714285714,
      boxShadow: 'none',
      boxShadowSecondary: 'none',
    },
    components: {
      Button: {
        primaryShadow: 'none',
        defaultShadow: 'none',
        fontWeight: 400,
        controlHeight: 32,
        borderRadius: tokens.borderRadius,
      },
      Card: {
        borderRadiusLG: tokens.borderRadiusCard,
        padding: tokens.cardPadding,
        paddingLG: tokens.cardPadding,
      },
      Table: {
        headerBg: tokens.colorSurfaceSecondary,
        headerColor: tokens.colorTextSecondary,
        headerSplitColor: tokens.colorBorder,
        rowHoverBg: tokens.colorSurfaceSecondary,
        headerBorderRadius: 0,
        fontSize,
      },
      Input: {
        colorBgContainer: tokens.colorCardBg,
        activeBg: tokens.colorCardBg,
        controlHeight: 32,
        borderRadius: tokens.borderRadius,
        fontSize,
      },
      Select: {
        colorBgContainer: tokens.colorCardBg,
        controlHeight: 32,
        borderRadius: tokens.borderRadius,
        fontSize,
      },
      Modal: {
        borderRadiusLG: 0,
      },
      Menu: {
        darkItemBg: tokens.colorSidebarBg,
        darkSubMenuItemBg: tokens.colorSidebarBg,
        darkItemSelectedBg: tokens.colorSidebarActive,
        darkItemColor: tokens.colorSidebarText,
        darkItemSelectedColor: tokens.colorSidebarTextActive,
        darkItemHoverBg: tokens.colorSidebarHover,
        itemBg: tokens.colorSidebarBg,
        itemSelectedBg: tokens.colorSidebarActive,
        itemColor: tokens.colorSidebarText,
        itemSelectedColor: tokens.colorSidebarTextActive,
        subMenuItemBg: tokens.colorSidebarBg,
        itemBorderRadius: tokens.borderRadius,
        itemHeight: 40,
        fontSize,
      },
      Layout: {
        siderBg: tokens.colorSidebarBg,
        bodyBg: tokens.colorPageBg,
        headerBg: tokens.colorCardBg,
      },
      Breadcrumb: {
        fontSize,
        itemColor: tokens.colorTextTertiary,
        lastItemColor: tokens.colorTextPrimary,
        separatorColor: tokens.colorTextTertiary,
      },
      Typography: {
        fontFamilyCode: tokens.fontFamily,
        titleMarginBottom: '0.5em',
        titleMarginTop: '1.2em',
      },
      Drawer: {
        borderRadiusLG: 0,
      },
    },
  };
}

/**
 * Ant Design theme aligned with the construction ERP design system.
 */
export const antdTheme: ThemeConfig = buildAntdTheme();
