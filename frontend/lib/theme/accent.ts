/**
 * Site accent trial switch.
 *
 * - `'teal'` → site primary (default)
 * - `'blue'` → login-page blue (trial)
 *
 * Change {@link ACCENT_MODE} only. Tokens, Ant Design, and CSS variables
 * (via ThemeAccentSync) all follow this flag.
 */
export type AccentMode = 'teal' | 'blue';

/** Flip to `'blue'` to trial the login-page blue accent. */
export const ACCENT_MODE: AccentMode = 'teal';

export interface AccentColors {
  primary: string;
  hover: string;
  light: string;
  softHover: string;
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
    primaryRgb: '29, 158, 117',
    hoverRgb: '15, 110, 86',
  },
  blue: {
    /** Matches login navy-adjacent interactive blue */
    primary: '#378ADD',
    hover: '#1A4A7A',
    light: '#E6F1FB',
    softHover: '#D7E8F8',
    primaryRgb: '55, 138, 221',
    hoverRgb: '26, 74, 122',
  },
};

export const accent: AccentColors = ACCENTS[ACCENT_MODE];
