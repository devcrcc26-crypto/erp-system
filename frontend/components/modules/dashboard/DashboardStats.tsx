'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PortfolioDashboardStats } from '@/lib/api/reporting.types';

type StatColor = 'teal' | 'red' | 'amber' | 'blue' | 'green' | 'default';

const STAT_COLOR_CLASS: Record<StatColor, string> = {
  teal: 'text-[#1D9E75]',
  red: 'text-[#E24B4A]',
  amber: 'text-[#BA7517]',
  blue: 'text-[#378ADD]',
  green: 'text-[#639922]',
  default: 'text-[var(--color-text-primary)]',
};

/**
 * Compact metric tile used across dashboard stat rows.
 */
export function StatCard({
  label,
  value,
  sub,
  total,
  color = 'default',
  href,
}: {
  label: string;
  value: number;
  sub?: string;
  total?: number;
  color?: StatColor;
  href?: string;
}): React.ReactNode {
  const body = (
    <div className="h-full bg-white rounded-lg border border-[rgba(0,0,0,0.08)] px-4 py-3 transition-colors hover:border-[rgba(0,0,0,0.14)]">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)] mb-2">
        {label}
      </p>
      <p className={`text-2xl font-bold ${STAT_COLOR_CLASS[color]}`}>
        {value.toLocaleString()}
      </p>
      {total !== undefined ? (
        <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
          of {total.toLocaleString()} total
        </p>
      ) : null}
      {sub ? (
        <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
          {sub}
        </p>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {body}
      </Link>
    );
  }

  return body;
}

/**
 * White card shell for a single chart, with a small uppercase header.
 */
export function ChartCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): React.ReactNode {
  return (
    <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)]">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] m-0">
          {title}
        </h3>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

/**
 * White card shell for a list/section, with an optional header action link.
 */
export function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: { label: string; href: string };
}): React.ReactNode {
  return (
    <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] m-0">
          {title}
        </h3>
        {action ? (
          <Link
            href={action.href}
            className="text-xs text-[#1D9E75] hover:text-[#0F6E56] font-medium no-underline"
          >
            {action.label} →
          </Link>
        ) : null}
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  );
}

/**
 * Portfolio "needs attention" quick-link list — only renders non-zero items.
 */
export function AttentionNeeded({
  stats,
}: {
  stats: PortfolioDashboardStats;
}): React.ReactNode {
  const items = [
    {
      label: `${stats.overdueIssues} overdue issues`,
      count: stats.overdueIssues,
      href: '/issues',
      color: 'red' as const,
    },
    {
      label: `${stats.overdueRfis} overdue RFIs`,
      count: stats.overdueRfis,
      href: '/rfis',
      color: 'red' as const,
    },
    {
      label: `${stats.overduePunchItems} overdue punch items`,
      count: stats.overduePunchItems,
      href: '/punch-list',
      color: 'amber' as const,
    },
    {
      label: `${stats.criticalRisks} critical risks`,
      count: stats.criticalRisks,
      href: '/risks',
      color: 'amber' as const,
    },
    {
      label: `${stats.pendingReviews} pending reviews`,
      count: stats.pendingReviews,
      href: '/review-inbox',
      color: 'blue' as const,
    },
    {
      label: `${stats.activeCrs} active change requests`,
      count: stats.activeCrs,
      href: '/change-requests',
      color: 'blue' as const,
    },
  ].filter((item) => item.count > 0);

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-tertiary)] py-4 text-center m-0">
        No items need attention
      </p>
    );
  }

  const colorClass: Record<'red' | 'amber' | 'blue', string> = {
    red: 'bg-[#FCEBEB] border-[#E24B4A]/20 text-[#C43D3C] hover:bg-[#E24B4A]/15',
    amber:
      'bg-[#FAEEDA] border-[#BA7517]/20 text-[#BA7517] hover:bg-[#BA7517]/15',
    blue: 'bg-[#E6F1FB] border-[#378ADD]/20 text-[#1A4A7A] hover:bg-[#378ADD]/15',
  };

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm font-medium no-underline transition-colors ${colorClass[item.color]}`}
        >
          <span>{item.label}</span>
          <span className="text-xs font-semibold">VIEW →</span>
        </Link>
      ))}
    </div>
  );
}
