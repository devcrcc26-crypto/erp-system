// UI polish pass - styles only, no logic changes

import { accent } from './accent';

/**
 * Design tokens — construction ERP palette.
 * Primary / sidebar accent follow {@link ACCENT_MODE} in `./accent`.
 */
export const tokens = {
  colorPrimary: accent.primary,
  colorPrimaryHover: accent.hover,
  colorPrimaryLight: accent.light,

  colorTeal400: accent.primary,
  colorTeal50: accent.light,
  colorTeal600: accent.hover,

  colorAmber400: '#BA7517',
  colorAmber50: '#FAEEDA',

  colorCoral400: '#D85A30',
  colorCoral50: '#FAECE7',

  /**
   * @deprecated Do not use as a generic accent. Prefer {@link colorAction}.
   * Kept for legacy chart callers until they move to CHART_SERIES.
   */
  colorBlue400: '#5B7C99',
  colorBlue50: '#E8EEF3',
  colorBlue800: '#3D556B',

  /** Interactive / selected UI only — aliases CSS `--action` (#1667C2). */
  colorAction: accent.primary,
  colorActionSoft: accent.light,
  colorActionHover: accent.hover,
  /** Logo / brand stripe only — CSS `--brand`. Not for status. */
  colorBrand: '#d7000f',

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
  /** Light sider - high-contrast labels, accent active states */
  colorSidebarBg: '#FFFFFF',
  colorSidebarRailBg: '#F7FAF8',
  colorSidebarActive: accent.light,
  colorSidebarHover: 'rgba(20, 29, 25, 0.04)',
  colorSidebarBorder: '#E1E9E5',
  colorSidebarText: '#141D19',
  colorSidebarTextMuted: '#5F6B66',
  colorSidebarTextActive: accent.hover,
  colorSidebarAccent: accent.primary,
  colorSidebarGroupLabel: '#5F6B66',
  colorSidebarIcon: '#5F6B66',

  /*
   * Neutrals - the login page's green-grey palette. Keep in step with the
   * `--erp-n-*` scale in app/globals.css (hex noted per token).
   */
  colorPageBg: '#EFF4F1', // --erp-n-100
  colorCardBg: '#FFFFFF',
  colorSurfaceSecondary: '#F7FAF8', // --erp-n-50
  /** Dividers and card outlines — CSS `--border` / `--color-line`. */
  colorBorder: '#E5E7EB',
  colorBorderSecondary: '#D0DBD6', // --erp-n-300
  colorTextPrimary: '#1F2937', // --text / --color-fg
  colorTextSecondary: '#6B7280', // --text-muted / --color-fg-muted
  colorTextTertiary: '#7A8782', // --color-text-subtle
  /** Form labels - matches `--color-text-body`. */
  colorTextBody: '#33403C',
  colorTextPlaceholder: '#93A29B', // --erp-n-400

  /* Form controls - the login field treatment. */
  /** Resting field fill - matches `--color-input-bg`. */
  colorInputBg: '#F7FAF8',
  /** Field and default-button outline - matches `--color-input-border`. */
  colorControlBorder: '#D5E0DC',
  colorControlHoverBorder: `rgba(${accent.primaryRgb}, 0.45)`,
  /** Focus ring colour (3px) - matches `--shadow-focus-ring`. */
  colorControlOutline: `rgba(${accent.primaryRgb}, 0.15)`,
  controlOutlineWidth: 3,
  /** Table header fill - the top of `--gradient-stage`. */
  colorTableHeaderBg: accent.wash,
  /** Primary button shadow - matches `--shadow-button-sm`. */
  shadowButton: `0 4px 12px rgba(${accent.primaryRgb}, 0.24)`,

  /**
   * Primary UI font - Segoe UI with system/CJK fallbacks.
   */
  fontFamily:
    "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei'",

  /** Controls (buttons, fields) - matches `--radius-control` (login fields). */
  borderRadius: 10,
  /** Small controls and tags. */
  borderRadiusSM: 6,
  /** Global AntD `borderRadiusLG` (dropdowns, popovers, tables, modals). */
  borderRadiusLG: 12,
  /** Cards - matches `--radius-card` (login card) in globals.css. */
  borderRadiusCard: 12,
  /** Raised card shadow - matches `--shadow-card` in globals.css. */
  shadowCard: '0 8px 32px rgba(0, 0, 0, 0.10), 0 1px 4px rgba(0, 0, 0, 0.06)',
  /** Floating panels: dropdowns, date pickers, popovers. */
  shadowPopup: '0 1px 2px rgba(20, 29, 25, 0.06), 0 8px 24px rgba(20, 29, 25, 0.1)',
  /** Heading text - neutral `--text` (not action blue). */
  colorTextHeading: '#1F2937',
  sidebarWidth: 256,

  /** Outer page padding */
  pagePadding: 24,
  pagePaddingMd: 24,
  /** Vertical gap between page sections and cards */
  sectionGap: 16,
  sectionGapMd: 16,
  /** Default Ant Design Card body padding */
  cardPadding: 18,
} as const;
