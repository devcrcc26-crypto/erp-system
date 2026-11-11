/**
 * Design tokens for the Overview tab. Tailwind utilities carry the UI; the hex
 * values exist only for SVG fills (Recharts cannot read utility classes).
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
    value: 'text-slate-900',
    pill: 'bg-slate-50 text-slate-600 ring-slate-200/70',
    fill: 'bg-slate-400',
  },
  ok: {
    badge: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/15',
    value: 'text-emerald-700',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
    fill: 'bg-emerald-500',
  },
  info: {
    badge: 'bg-sky-500/10 text-sky-700 ring-sky-500/15',
    value: 'text-sky-700',
    pill: 'bg-sky-50 text-sky-700 ring-sky-200/70',
    fill: 'bg-sky-500',
  },
  warn: {
    badge: 'bg-amber-500/10 text-amber-700 ring-amber-500/15',
    value: 'text-amber-700',
    pill: 'bg-amber-50 text-amber-700 ring-amber-200/70',
    fill: 'bg-amber-500',
  },
  urgent: {
    badge: 'bg-rose-500/10 text-rose-700 ring-rose-500/15',
    value: 'text-rose-700',
    pill: 'bg-rose-50 text-rose-700 ring-rose-200/70',
    fill: 'bg-rose-500',
  },
};

/** Contract-expiry warning levels (soft → severe). */
export const CONTRACT_LEVEL_COLORS = {
  within30: '#fb7185', // rose-400
  within60: '#fbbf24', // amber-400
  within90: '#fde047', // yellow-300
  expired: '#b91c1c', // red-700 (muted)
} as const;

/** Donut palette for leave types (ordered by prominence). */
export const LEAVE_PALETTE: readonly string[] = [
  '#10b981', // emerald-500
  '#0ea5e9', // sky-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#f43f5e', // rose-500
  '#14b8a6', // teal-500
  '#64748b', // slate-500
];

export const CHART_TEXT = '#475569'; // slate-600
export const CHART_GRID = '#f1f5f9'; // slate-100

/** Stacked overtime series (normal / evening / sunday / holiday). */
export const OT_SERIES_COLORS = {
  normal: '#10b981', // emerald-500
  evening: '#0ea5e9', // sky-500
  sunday: '#8b5cf6', // violet-500
  holiday: '#f59e0b', // amber-500
} as const;

export const BAR_FILL = '#0ea5e9'; // sky-500 — default single-series bar
