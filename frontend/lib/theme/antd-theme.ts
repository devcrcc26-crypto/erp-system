import type { ThemeConfig } from 'antd';
import { tokens } from './tokens';

/**
 * Ant Design theme aligned with the existing frontend visual design.
 */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: tokens.colorPrimary,
    colorPrimaryHover: tokens.colorPrimaryHover,
    colorBgContainer: tokens.colorCardBg,
    colorBgLayout: tokens.colorPageBg,
    colorBorder: tokens.colorBorder,
    colorText: tokens.colorTextPrimary,
    colorTextSecondary: tokens.colorTextSecondary,
    borderRadius: tokens.borderRadius,
    fontFamily: 'Arial, Helvetica, sans-serif',
    controlHeight: 36,
  },
  components: {
    Button: {
      primaryShadow: 'none',
      fontWeight: 600,
    },
    Card: {
      borderRadiusLG: tokens.borderRadius,
    },
    Table: {
      headerBg: tokens.colorCardBg,
      headerColor: tokens.colorTextSecondary,
      rowHoverBg: '#f8fafc',
    },
    Input: {
      colorBgContainer: '#f8fafc',
      activeBg: tokens.colorCardBg,
    },
    Select: {
      colorBgContainer: '#f8fafc',
    },
    Modal: {
      borderRadiusLG: tokens.borderRadius,
    },
    Menu: {
      darkItemBg: tokens.colorSidebarBg,
      darkItemSelectedBg: tokens.colorSidebarActive,
      darkItemColor: tokens.colorSidebarText,
      darkItemSelectedColor: tokens.colorSidebarTextActive,
      darkSubMenuItemBg: tokens.colorSidebarBg,
    },
    Layout: {
      siderBg: tokens.colorSidebarBg,
      bodyBg: tokens.colorPageBg,
    },
  },
};
