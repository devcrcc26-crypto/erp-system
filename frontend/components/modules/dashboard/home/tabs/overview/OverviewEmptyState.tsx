'use client';

import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

/**
 * Zero-state for a widget: a quiet dashed panel with a micro-icon, one line of
 * copy and an optional secondary action. Designed to sit inside OverviewCard.
 */
export default function OverviewEmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}): React.ReactNode {
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center ${
        compact ? 'px-4 py-5' : 'px-6 py-8'
      }`}
    >
      <span
        aria-hidden
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 ring-1 ring-inset ring-slate-200"
      >
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <p className="m-0 text-sm font-medium text-slate-700">{title}</p>
      {description ? (
        <p className="m-0 max-w-[32ch] text-xs leading-relaxed text-slate-500">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
