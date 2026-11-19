import { accent } from '@/lib/theme/accent';

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
    badge:
      'bg-[color:var(--erp-accent-light)] text-[color:var(--erp-accent-hover)] ring-[rgba(var(--erp-accent-rgb),0.22)]',
    value: 'text-[color:var(--erp-accent-hover)]',
    pill:
      'bg-[color:var(--erp-accent-light)] text-[color:var(--erp-accent-hover)] ring-[rgba(var(--erp-accent-rgb),0.22)]',
    fill: 'bg-[image:var(--gradient-primary)]',
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
  accent.primary, // brand blue
  '#14b8a6', // teal-500 (sky is too close to brand blue)
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#f43f5e', // rose-500
  accent.hover, // brand blue dark
  '#5f6b66', // --erp-n-500
];

export const CHART_TEXT = '#4a5651'; // --erp-n-600
export const CHART_GRID = '#eff4f1'; // --erp-n-100

/** Stacked overtime series (normal / evening / sunday / holiday). */
export const OT_SERIES_COLORS = {
  normal: accent.primary, // brand blue
  evening: '#14b8a6', // teal-500
  sunday: '#8b5cf6', // violet-500
  holiday: '#f59e0b', // amber-500
} as const;

export const BAR_FILL = accent.primary; // brand — default single-series bar
