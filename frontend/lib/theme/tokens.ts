// UI polish pass - styles only, no logic changes

/**
 * Design tokens - teal-forward construction ERP palette.
 * Used by Ant Design ConfigProvider and shared UI components.
 */
export const tokens = {
  colorPrimary: '#1D9E75',
  colorPrimaryHover: '#0F6E56',
  colorPrimaryLight: '#E1F5EE',

  colorTeal400: '#1D9E75',
  colorTeal50: '#E1F5EE',
  colorTeal600: '#0F6E56',

  colorAmber400: '#BA7517',
  colorAmber50: '#FAEEDA',

  colorCoral400: '#D85A30',
  colorCoral50: '#FAECE7',

  colorBlue400: '#378ADD',
  colorBlue50: '#E6F1FB',
  colorBlue800: '#1A4A7A',

  colorCyan400: '#0891B2',
  colorCyan50: '#ECFEFF',

  colorRed400: '#E24B4A',
  colorRed50: '#FCEBEB',
  colorRed600: '#C43D3C',

  colorGreen400: '#639922',
  colorGreen50: '#EAF3DE',
  colorGreen600: '#4A7319',

  colorGray50: '#F1EFE8',
  colorGray100: '#D3D1C7',
  colorGray200: '#B8B6AE',
  colorGray600: '#5F5E5A',

  colorNavy: '#1B2B4B',
  /** Ant Design Pro dark sider */
  colorSidebarBg: '#001529',
  colorSidebarActive: 'rgba(255, 255, 255, 0.08)',
  colorSidebarHover: 'rgba(255, 255, 255, 0.08)',
  colorSidebarBorder: 'rgba(255, 255, 255, 0.08)',
  colorSidebarText: 'rgba(255, 255, 255, 0.65)',
  colorSidebarTextActive: '#FFFFFF',
  colorSidebarAccent: '#1D9E75',

  colorPageBg: '#F5F5F5',
  colorCardBg: '#FFFFFF',
  colorSurfaceSecondary: '#FAFAFA',
  colorBorder: 'rgba(0, 0, 0, 0.06)',
  colorBorderSecondary: 'rgba(0, 0, 0, 0.15)',
  colorTextPrimary: 'rgba(0, 0, 0, 0.88)',
  colorTextSecondary: 'rgba(0, 0, 0, 0.65)',
  colorTextTertiary: 'rgba(0, 0, 0, 0.45)',

  /**
   * Primary UI font — Segoe UI with system/CJK fallbacks.
   */
  fontFamily:
    "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei'",

  borderRadius: 6,
  borderRadiusCard: 8,
  sidebarWidth: 220,

  /** Outer page padding */
  pagePadding: 24,
  pagePaddingMd: 24,
  /** Vertical gap between page sections and cards */
  sectionGap: 16,
  sectionGapMd: 16,
  /** Default Ant Design Card body padding */
  cardPadding: 18,
} as const;
