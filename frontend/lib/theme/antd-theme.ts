// UI polish pass — styles only, no logic changes

import type { ThemeConfig } from 'antd';
import { FONT_SIZE_BASE_PX, getFontScale } from './font-scale';
import { tokens } from './tokens';

const fontStack =
  "system-ui, -apple-system, 'Segoe UI', sans-serif";

function scaledPx(basePx: number, fontSizePx: number): number {
  return Math.round(basePx * getFontScale(fontSizePx));
}

/**
 * Builds an Ant Design theme for the given base font size.
 */
export function buildAntdTheme(fontSizePx: number = FONT_SIZE_BASE_PX): ThemeConfig {
  const fontSize = scaledPx(13, fontSizePx);
  const fontSizeSM = scaledPx(11, fontSizePx);
  const fontSizeLG = scaledPx(14, fontSizePx);

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
      fontWeightStrong: 500,
      fontFamily: fontStack,
      controlHeight: 36,
      lineHeight: 1.5,
      boxShadow: 'none',
      boxShadowSecondary: 'none',
    },
    components: {
      Button: {
        primaryShadow: 'none',
        defaultShadow: 'none',
        fontWeight: 500,
        controlHeight: 32,
        borderRadius: 8,
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
        fontSize,
      },
      Input: {
        colorBgContainer: tokens.colorCardBg,
        activeBg: tokens.colorCardBg,
        controlHeight: 36,
        borderRadius: 8,
        fontSize,
      },
      Select: {
        colorBgContainer: tokens.colorCardBg,
        controlHeight: 36,
        borderRadius: 8,
        fontSize,
      },
      Modal: {
        borderRadiusLG: tokens.borderRadiusCard,
      },
      Menu: {
        itemBg: tokens.colorSidebarBg,
        itemSelectedBg: tokens.colorSidebarActive,
        itemColor: tokens.colorSidebarText,
        itemSelectedColor: tokens.colorSidebarTextActive,
        subMenuItemBg: tokens.colorSidebarBg,
        itemBorderRadius: 8,
        itemHeight: 36,
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
