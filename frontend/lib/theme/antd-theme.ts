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
      /* Controls take the login field outline; dividers and cards the lighter one. */
      colorBorder: tokens.colorControlBorder,
      colorBorderSecondary: tokens.colorBorder,
      colorText: tokens.colorTextPrimary,
      colorTextSecondary: tokens.colorTextSecondary,
      colorTextTertiary: tokens.colorTextTertiary,
      colorTextPlaceholder: tokens.colorTextPlaceholder,
      /* Links follow the login "Forgot password" link (teal, 6.3:1 on white). */
      colorLink: tokens.colorPrimaryHover,
      colorLinkHover: tokens.colorPrimary,
      colorLinkActive: tokens.colorPrimaryHover,
      /* Focus ring: 3px soft accent halo, as on the login fields. */
      controlOutline: tokens.colorControlOutline,
      controlOutlineWidth: tokens.controlOutlineWidth,
      colorSuccess: tokens.colorGreen400,
      colorWarning: tokens.colorAmber400,
      colorError: tokens.colorRed400,
      colorInfo: tokens.colorBlue400,
      borderRadius: tokens.borderRadius,
      borderRadiusSM: tokens.borderRadiusSM,
      borderRadiusLG: tokens.borderRadiusLG,
      fontSize,
      fontSizeSM,
      fontSizeLG,
      fontWeightStrong: 600,
      fontFamily: tokens.fontFamily,
      controlHeight: 32,
      lineHeight: 1.5714285714285714,
      boxShadow: 'none',
      /* Floating panels (dropdowns, pickers, popovers) need an edge on white. */
      boxShadowSecondary: tokens.shadowPopup,
    },
    components: {
      Button: {
        /* Gradient fill for primary buttons is applied in globals.css (brand layer). */
        primaryShadow: tokens.shadowButton,
        defaultShadow: 'none',
        dangerShadow: 'none',
        fontWeight: 500,
        controlHeight: 32,
        borderRadius: tokens.borderRadius,
        defaultBorderColor: tokens.colorControlBorder,
      },
      Card: {
        borderRadiusLG: tokens.borderRadiusCard,
        /** Borderless cards only; bordered cards stay flat (see globals.css tokens). */
        boxShadowTertiary: tokens.shadowCard,
        padding: tokens.cardPadding,
        paddingLG: tokens.cardPadding,
        colorTextHeading: tokens.colorTextHeading,
      },
      Table: {
        headerBg: tokens.colorTableHeaderBg,
        headerColor: tokens.colorTextSecondary,
        headerSplitColor: tokens.colorBorder,
        headerSortActiveBg: tokens.colorPageBg,
        headerSortHoverBg: tokens.colorPageBg,
        borderColor: tokens.colorBorder,
        rowHoverBg: tokens.colorSurfaceSecondary,
        headerBorderRadius: 0,
        fontSize,
      },
      /*
       * Fields: tinted at rest, white with an accent border and halo when
       * focused - the login field treatment, at the app's 32px density.
       */
      Input: {
        colorBgContainer: tokens.colorInputBg,
        hoverBg: tokens.colorInputBg,
        activeBg: tokens.colorCardBg,
        hoverBorderColor: tokens.colorControlHoverBorder,
        activeBorderColor: tokens.colorPrimary,
        controlHeight: 32,
        borderRadius: tokens.borderRadius,
        fontSize,
      },
      InputNumber: {
        colorBgContainer: tokens.colorInputBg,
        hoverBg: tokens.colorInputBg,
        activeBg: tokens.colorCardBg,
        hoverBorderColor: tokens.colorControlHoverBorder,
        activeBorderColor: tokens.colorPrimary,
      },
      Mentions: {
        colorBgContainer: tokens.colorInputBg,
        hoverBg: tokens.colorInputBg,
        activeBg: tokens.colorCardBg,
        hoverBorderColor: tokens.colorControlHoverBorder,
        activeBorderColor: tokens.colorPrimary,
      },
      DatePicker: {
        colorBgContainer: tokens.colorInputBg,
        hoverBg: tokens.colorInputBg,
        activeBg: tokens.colorCardBg,
        hoverBorderColor: tokens.colorControlHoverBorder,
        activeBorderColor: tokens.colorPrimary,
      },
      Select: {
        colorBgContainer: tokens.colorCardBg,
        selectorBg: tokens.colorInputBg,
        hoverBorderColor: tokens.colorControlHoverBorder,
        activeBorderColor: tokens.colorPrimary,
        activeOutlineColor: tokens.colorControlOutline,
        controlHeight: 32,
        borderRadius: tokens.borderRadius,
        fontSize,
      },
      /* A 6px radius would turn a 16px box into a blob; keep checkboxes crisp. */
      Checkbox: {
        borderRadiusSM: 4,
      },
      Form: {
        labelColor: tokens.colorTextBody,
      },
      Tabs: {
        itemSelectedColor: tokens.colorPrimaryHover,
        itemHoverColor: tokens.colorPrimary,
        itemActiveColor: tokens.colorPrimaryHover,
      },
      Modal: {
        borderRadiusLG: tokens.borderRadiusCard,
        titleColor: tokens.colorTextHeading,
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
        colorTextHeading: tokens.colorTextHeading,
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
