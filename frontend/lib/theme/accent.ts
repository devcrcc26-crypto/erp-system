/**
 * Site accent switch.
 *
 * - `'blue'` → CRCC logo blue, same as the employee ID card (default)
 * - `'teal'` → previous teal primary
 *
 * Change {@link ACCENT_MODE} only. Tokens, Ant Design, and CSS variables
 * (via ThemeAccentSync) all follow this flag.
 */
export type AccentMode = 'teal' | 'blue';

export const ACCENT_MODE: AccentMode = 'blue';

export interface AccentColors {
  primary: string;
  hover: string;
  light: string;
  softHover: string;
  /** Very light tint for active tiles, totals rows and table headers. */
  wash: string;
  /** Comma-separated RGB for `rgba(var(--erp-accent-rgb), a)` */
  primaryRgb: string;
  hoverRgb: string;
}

const ACCENTS: Record<AccentMode, AccentColors> = {
  teal: {
    primary: '#1D9E75',
    hover: '#0F6E56',
    light: '#E1F5EE',
    softHover: '#D9F0E7',
    wash: '#F0FAF6',
    primaryRgb: '29, 158, 117',
    hoverRgb: '15, 110, 86',
  },
  blue: {
    /** CRCC globe blue (ID card header). White text 6.4:1. */
    primary: '#1F5FAE',
    /** ID card dark blue. On white 10.4:1. */
    hover: '#163F78',
    light: '#E8F0FA',
    softHover: '#D6E4F5',
    wash: '#F2F6FC',
    primaryRgb: '31, 95, 174',
    hoverRgb: '22, 63, 120',
  },
};

export const accent: AccentColors = ACCENTS[ACCENT_MODE];
