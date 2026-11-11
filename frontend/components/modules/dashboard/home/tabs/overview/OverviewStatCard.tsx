'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { TONE, type OverviewTone } from './overview-tokens';

/**
 * Top-row metric tile: muted tracking-wide label, tinted icon badge, a sharp
 * tabular figure and an optional sub-text badge. Renders as a link when `href`
 * is set so the whole tile is the hit target.
 */
export default function OverviewStatCard({
  icon: Icon,
  label,
  value,
  badge,
  tone = 'neutral',
  valueTone,
  href,
  index = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Short contextual text shown as a pill under the value. */
  badge?: string;
  /** Icon badge tone. */
  tone?: OverviewTone;
  /** Colour of the figure; defaults to slate-900 unless tone is warn/urgent/ok. */
  valueTone?: OverviewTone;
  href?: string;
  /** Position in the strip, used for the stagger. */
  index?: number;
}): React.ReactNode {
  const reduceMotion = useReducedMotion();
  const figureTone = valueTone ?? (tone === 'neutral' ? undefined : tone);

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 min-w-0 pt-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-slate-500">
          {label}
        </p>
        <span
          aria-hidden
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-200 group-hover:scale-105 ${TONE[tone].badge}`}
        >
          <Icon size={18} strokeWidth={1.9} />
        </span>
      </div>
      <div className="flex flex-col items-start gap-2">
        <p
          className={`m-0 text-[28px] font-semibold leading-none tracking-tight tabular-nums ${
            figureTone ? TONE[figureTone].value : 'text-slate-900'
          }`}
        >
          {value}
        </p>
        {badge ? (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-5 ring-1 ring-inset ${
              figureTone ? TONE[figureTone].pill : TONE.neutral.pill
            }`}
          >
            {badge}
          </span>
        ) : null}
      </div>
    </>
  );

  const surface =
    'group flex h-full min-w-0 flex-col justify-between gap-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all duration-200 hover:border-slate-200 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600';

  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.32,
        delay: reduceMotion ? 0 : index * 0.05,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="min-w-0 list-none"
    >
      {href ? (
        <Link href={href} className={`${surface} text-inherit no-underline`}>
          {inner}
        </Link>
      ) : (
        <div className={surface}>{inner}</div>
      )}
    </motion.li>
  );
}

/** Pulse placeholder with the same footprint as a stat card. */
export function OverviewStatSkeleton(): React.ReactNode {
  return (
    <li className="min-w-0 list-none">
      <div className="flex h-full flex-col justify-between gap-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
          <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-7 w-16 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-4 w-20 animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>
    </li>
  );
}
