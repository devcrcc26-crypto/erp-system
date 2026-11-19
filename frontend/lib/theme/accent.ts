/**
 * Site accent switch.
 *
 * - `'blue'` → CRCC azure blue (default)
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
    /** Clean azure (CRCC blue family, less violet than ink). White text 5.6:1. */
    primary: '#1667C2',
    /** Deep azure for hover, headings, sidebar active. On white 8.6:1. */
    hover: '#0F4C8F',
    light: '#E7F0FB',
    softHover: '#D3E4F7',
    wash: '#F3F7FD',
    primaryRgb: '22, 103, 194',
    hoverRgb: '15, 76, 143',
  },
};

export const accent: AccentColors = ACCENTS[ACCENT_MODE];
