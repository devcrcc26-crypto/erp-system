/**
 * Design tokens matching the existing CCECC PWF Tailwind prototype.
 * Used by Ant Design ConfigProvider and shared UI components.
 */
export const tokens = {
  colorPrimary: '#f97316',
  colorPrimaryHover: '#ea580c',
  colorPrimaryLight: '#fff7ed',

  colorNavy: '#1e293b',
  colorSidebarBg: '#1e293b',
  colorSidebarActive: '#334155',
  colorSidebarText: '#94a3b8',
  colorSidebarTextActive: '#ffffff',
  colorSidebarAccent: '#f97316',

  colorPageBg: '#f1f5f9',
  colorCardBg: '#ffffff',
  colorBorder: '#e2e8f0',
  colorTextPrimary: '#0f172a',
  colorTextSecondary: '#64748b',

  borderRadius: 6,
  sidebarWidth: 256,

  /** Outer page padding (matches Tailwind p-6 / md:p-8). */
  pagePadding: 24,
  pagePaddingMd: 32,
  /** Vertical gap between page sections and cards. */
  sectionGap: 24,
  sectionGapMd: 32,
  /** Default Ant Design Card body padding. */
  cardPadding: 28,
} as const;
