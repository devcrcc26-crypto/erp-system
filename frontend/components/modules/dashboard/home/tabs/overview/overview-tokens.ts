/**
 * Design tokens for the Overview tab. Tailwind utilities carry the UI; the hex
 * values exist only for SVG fills (Recharts cannot read utility classes).
 *
 * Color roles: neutral (default) · action (interactive only) · semantic (status).
 */

export type OverviewTone = 'neutral' | 'ok' | 'warn' | 'urgent' | 'info';

export interface ToneClasses {
  /** Icon badge: tinted background + ring + icon colour. */
  badge: string;
  /** Headline figure colour. */
  value: string;
  /** Small pill (status / trend). */
  pill: string;
  /** Progress fill. */
  fill: string;
}

export const TONE: Record<OverviewTone, ToneClasses> = {
  neutral: {
    badge: 'bg-slate-500/10 text-slate-600 ring-slate-500/15',
    value: 'text-fg',
    pill: 'bg-slate-50 text-slate-600 ring-slate-200/70',
    fill: 'bg-slate-400',
  },
  /** Success / approved — green, never action blue. */
  ok: {
    badge: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/15',
    value: 'text-emerald-700',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
    fill: 'bg-emerald-500',
  },
  /**
   * Decorative / informational chrome — same as neutral.
   * Interactive CTAs use `text-action` / `bg-action-soft` directly.
   */
  info: {
    badge: 'bg-slate-500/10 text-slate-600 ring-slate-500/15',
    value: 'text-fg',
    pill: 'bg-slate-50 text-slate-600 ring-slate-200/70',
    fill: 'bg-slate-400',
  },
  warn: {
    badge: 'bg-amber-500/10 text-amber-700 ring-amber-500/15',
    value: 'text-amber-700',
    pill: 'bg-amber-50 text-amber-700 ring-amber-200/70',
    fill: 'bg-amber-500',
  },
  /** Expired / rejected / error — red only. */
  urgent: {
    badge: 'bg-rose-500/10 text-rose-700 ring-rose-500/15',
    value: 'text-rose-700',
    pill: 'bg-rose-50 text-rose-700 ring-rose-200/70',
    fill: 'bg-rose-500',
  },
};

/**
 * Contract-expiry urgency ramp (semantic only).
 * Expired = red-700 · ≤30d = orange-500 · ≤60d = amber-400 · ≤90d = slate-300.
 */
export const CONTRACT_LEVEL_COLORS = {
  within30: '#f97316', // orange-500
  within60: '#fbbf24', // amber-400
  within90: '#cbd5e1', // slate-300
  expired: '#b91c1c', // red-700
} as const;

/**
 * Categorical chart series — visibly distinct from `--action` (#1667C2).
 * First hue is a muted slate-blue (#5B7C99), not the interactive action color.
 */
export const CHART_SERIES: readonly string[] = [
  '#5B7C99', // muted slate-blue
  '#14b8a6', // teal-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#f43f5e', // rose-500
  '#64748b', // slate-500
  '#0d9488', // teal-600
];

/** @deprecated Prefer {@link CHART_SERIES}. */
export const LEAVE_PALETTE: readonly string[] = CHART_SERIES;

export const CHART_TEXT = '#4a5651'; // --erp-n-600
export const CHART_GRID = '#eff4f1'; // --erp-n-100

/** Stacked overtime series (normal / evening / sunday / holiday). */
export const OT_SERIES_COLORS = {
  normal: CHART_SERIES[0]!,
  evening: CHART_SERIES[1]!,
  sunday: CHART_SERIES[2]!,
  holiday: CHART_SERIES[3]!,
} as const;

export const BAR_FILL = CHART_SERIES[0]!;
