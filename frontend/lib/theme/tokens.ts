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
  colorSidebarBg: '#FFFFFF',
  colorSidebarActive: '#E1F5EE',
  colorSidebarText: '#1A1A1A',
  colorSidebarTextActive: '#0F6E56',
  colorSidebarAccent: '#1D9E75',

  colorPageBg: '#F1EFE8',
  colorCardBg: '#FFFFFF',
  colorSurfaceSecondary: '#F8F7F4',
  colorBorder: 'rgba(0, 0, 0, 0.12)',
  colorBorderSecondary: 'rgba(0, 0, 0, 0.18)',
  colorTextPrimary: '#1A1A1A',
  colorTextSecondary: '#5F5E5A',
  colorTextTertiary: '#888780',

  borderRadius: 8,
  borderRadiusCard: 12,
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
