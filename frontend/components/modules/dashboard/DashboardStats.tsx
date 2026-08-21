'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  BellOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  QuestionCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type {
  MyDashboardActivityItem,
  PortfolioDashboardStats,
} from '@/lib/api/reporting.types';
import { formatRelativeTime } from '@/lib/utils/date-format';

/** Shared recharts style constants — flat axes, subtle grid, clean tooltip. */
export const CHART_AXIS_STYLE = { fontSize: 11, fill: '#888780' };
export const CHART_GRID_COLOR = 'rgba(0,0,0,0.05)';
export const CHART_TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '0.5px solid rgba(0,0,0,0.12)',
  fontSize: 12,
};
export const CHART_TOOLTIP_CURSOR = { fill: 'rgba(0,0,0,0.04)' };

type StatColor = 'teal' | 'red' | 'amber' | 'blue' | 'green' | 'default';

const STAT_ACCENT: Record<
  StatColor,
  { bar: string; text: string; bg: string }
> = {
  teal: { bar: 'bg-[#1D9E75]', text: 'text-[#1D9E75]', bg: 'bg-[#E1F5EE]' },
  red: { bar: 'bg-[#E24B4A]', text: 'text-[#E24B4A]', bg: 'bg-[#FCEBEB]' },
  amber: { bar: 'bg-[#BA7517]', text: 'text-[#BA7517]', bg: 'bg-[#FAEEDA]' },
  blue: { bar: 'bg-[#378ADD]', text: 'text-[#378ADD]', bg: 'bg-[#E6F1FB]' },
  green: { bar: 'bg-[#639922]', text: 'text-[#639922]', bg: 'bg-[#EAF3DE]' },
  default: {
    bar: 'bg-[#B8B6AE]',
    text: 'text-[var(--color-text-primary)]',
    bg: 'bg-[#F8F7F4]',
  },
};

/**
 * Compact accent stat tile — colored top bar, icon badge, and large value.
 */
export function StatCard({
  label,
  value,
  sub,
  color = 'default',
  icon,
  href,
}: {
  label: string;
  value: number;
  sub?: string;
  color?: StatColor;
  icon?: ReactNode;
  href?: string;
}): React.ReactNode {
  const accent = STAT_ACCENT[color];

  const body = (
    <div className="h-full bg-white rounded-xl border border-[rgba(0,0,0,0.08)] overflow-hidden transition-colors hover:border-[rgba(0,0,0,0.14)]">
      <div className={`h-1 w-full ${accent.bar}`} />
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] m-0">
            {label}
          </p>
          {icon ? (
            <div
              className={`w-7 h-7 rounded-lg ${accent.bg} flex items-center justify-center flex-shrink-0`}
            >
              <span className={`text-sm ${accent.text}`}>{icon}</span>
            </div>
          ) : null}
        </div>
        <p className={`text-3xl font-bold ${accent.text} leading-none`}>
          {value.toLocaleString()}
        </p>
        {sub ? (
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5 m-0">
            {sub}
          </p>
        ) : null}
      </div>
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
 * White card shell with an icon badge, title, subtitle, and optional header action.
 */
export function ChartCard({
  title,
  subtitle,
  icon,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}): React.ReactNode {
  return (
    <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon ? (
            <div className="w-7 h-7 rounded-lg bg-[#E1F5EE] flex items-center justify-center flex-shrink-0">
              <span className="text-sm text-[#1D9E75]">{icon}</span>
            </div>
          ) : null}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] m-0 truncate">
              {title}
            </h3>
            {subtitle ? (
              <p className="text-xs text-[var(--color-text-tertiary)] m-0 truncate">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/**
 * White card shell for a list/section, with an optional header action link.
 * Lighter-weight than ChartCard (no icon badge) — used where a plain list needs a header.
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
    <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)]">
      <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] m-0">
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
      <div className="p-5">{children}</div>
    </div>
  );
}

const ATTENTION_COLOR_CLASS: Record<'red' | 'amber' | 'blue', string> = {
  red: 'bg-[#FCEBEB] border-[#E24B4A]/20 text-[#C43D3C]',
  amber: 'bg-[#FAEEDA] border-[#BA7517]/20 text-[#BA7517]',
  blue: 'bg-[#E6F1FB] border-[#378ADD]/20 text-[#1A4A7A]',
};

/**
 * Portfolio "needs attention" alert list — colored rows, only non-zero items.
 */
export function AttentionNeeded({
  stats,
}: {
  stats: PortfolioDashboardStats;
}): React.ReactNode {
  const items = [
    {
      label: 'overdue issues',
      count: stats.overdueIssues,
      href: '/issues',
      color: 'red' as const,
      icon: <ExclamationCircleOutlined />,
    },
    {
      label: 'overdue RFIs',
      count: stats.overdueRfis,
      href: '/rfis',
      color: 'red' as const,
      icon: <QuestionCircleOutlined />,
    },
    {
      label: 'overdue punch items',
      count: stats.overduePunchItems,
      href: '/punch-list',
      color: 'amber' as const,
      icon: <CheckSquareOutlined />,
    },
    {
      label: 'critical risks',
      count: stats.criticalRisks,
      href: '/risks',
      color: 'amber' as const,
      icon: <WarningOutlined />,
    },
    {
      label: 'pending reviews',
      count: stats.pendingReviews,
      href: '/review-inbox',
      color: 'blue' as const,
      icon: <EyeOutlined />,
    },
    {
      label: 'active change requests',
      count: stats.activeCrs,
      href: '/change-requests',
      color: 'blue' as const,
      icon: <EditOutlined />,
    },
  ].filter((item) => item.count > 0);

  return (
    <ChartCard
      title="Attention Needed"
      subtitle={`${items.length} item${items.length !== 1 ? 's' : ''} require action`}
      icon={<BellOutlined />}
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CheckCircleOutlined className="text-3xl text-[#639922] mb-2" />
          <p className="text-sm text-[var(--color-text-tertiary)] m-0">
            All clear — nothing needs attention
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg border no-underline transition-opacity hover:opacity-80 ${ATTENTION_COLOR_CLASS[item.color]}`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">{item.icon}</span>
                <span className="text-sm font-semibold">
                  {item.count} {item.label}
                </span>
              </div>
              <span className="text-xs font-bold tracking-wide">VIEW →</span>
            </Link>
          ))}
        </div>
      )}
    </ChartCard>
  );
}

const ACTIVITY_TYPE_ICON: Record<string, ReactNode> = {
  RFI_RESPONSE: <QuestionCircleOutlined />,
  ISSUE_RESPONSE: <ExclamationCircleOutlined />,
  REVIEW_SESSION: <EyeOutlined />,
  ACTION_ITEM: <CheckSquareOutlined />,
  NOTIFICATION: <BellOutlined />,
};

/**
 * Recent cross-module activity feed with per-type icon badges.
 */
export function RecentActivity({
  items,
}: {
  items: MyDashboardActivityItem[];
}): React.ReactNode {
  return (
    <ChartCard
      title="Recent Activity"
      subtitle="Latest actions across projects"
      icon={<ClockCircleOutlined />}
    >
      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-tertiary)] m-0">
          No recent activity.
        </p>
      ) : (
        <div className="flex flex-col">
          {items.slice(0, 8).map((item, index) => (
            <Link
              key={`${item.type}-${item.date}-${index}`}
              href={item.link}
              className="flex items-start gap-3 py-2.5 border-b border-[rgba(0,0,0,0.05)] last:border-0 hover:bg-[#F8F7F4] -mx-5 px-5 transition-colors no-underline"
            >
              <div className="w-7 h-7 rounded-lg bg-[#F1EFE8] flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {ACTIVITY_TYPE_ICON[item.type] ?? <BellOutlined />}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--color-text-primary)] truncate m-0">
                  {item.title}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 m-0">
                  {formatRelativeTime(item.date)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </ChartCard>
  );
}
