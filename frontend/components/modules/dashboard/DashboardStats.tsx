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

/** Shared recharts style constants - flat axes, subtle grid, clean tooltip. */
export const CHART_AXIS_STYLE = { fontSize: 11, fill: '#64748b' };
export const CHART_GRID_COLOR = 'rgba(0,0,0,0.05)';
export const CHART_TOOLTIP_STYLE = {
  borderRadius: 10,
  border: '1px solid #e8ebef',
  fontSize: 12,
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
};
export const CHART_TOOLTIP_CURSOR = { fill: 'rgba(0,0,0,0.04)' };

type StatColor = 'teal' | 'red' | 'amber' | 'blue' | 'green' | 'default';

const STAT_ACCENT: Record<StatColor, { bg: string; fg: string }> = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  default: { bg: '#F1F5F9', fg: '#64748B' },
};

/**
 * KPI cell for dashboard stat bars - Users chrome (`erp-users-stat`).
 */
export function StatCard({
  label,
  value,
  sub,
  color = 'default',
  icon,
  href,
  suffix,
}: {
  label: string;
  value: number;
  /** Unit shown after the value, e.g. "%". */
  suffix?: string;
  sub?: string;
  color?: StatColor;
  icon?: ReactNode;
  href?: string;
}): React.ReactNode {
  const tint = STAT_ACCENT[color];
  const className = `erp-users-stat erp-contract-stat erp-dashboard-stat min-w-0${
    href ? '' : ' erp-contract-stat--static'
  }`;

  const body = (
    <>
      {icon ? (
        <span
          className="erp-users-stat-chip"
          style={{ background: tint.bg, color: tint.fg }}
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 text-left">
        <p className="erp-users-stat-label">{label}</p>
        <p
          className="erp-users-stat-value"
          style={{ color: color === 'default' ? undefined : tint.fg }}
        >
          {value.toLocaleString()}
          {suffix}
        </p>
        {sub ? <p className="erp-users-cell-sub m-0 mt-0.5 truncate">{sub}</p> : null}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${className} no-underline`}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

/**
 * Chart / panel card - Users `erp-pro-card` + section header chrome.
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
    <div className="erp-pro-card erp-dashboard-panel overflow-hidden">
      <div className="erp-employee-section-header flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span
              className="erp-users-stat-chip"
              style={{ background: '#E1F5EE', color: '#1D9E75' }}
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="erp-employee-section-title m-0 truncate">{title}</h3>
            {subtitle ? (
              <p className="erp-users-cell-sub m-0 mt-0.5 truncate">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {action}
      </div>
      <div className="erp-employee-section-body">{children}</div>
    </div>
  );
}

/**
 * List section card - same Users panel chrome as ChartCard, without icon badge.
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
    <div className="erp-pro-card erp-dashboard-panel overflow-hidden">
      <div className="erp-employee-section-header flex flex-wrap items-center justify-between gap-2">
        <h3 className="erp-employee-section-title m-0">{title}</h3>
        {action ? (
          <Link
            href={action.href}
            className="text-xs font-medium text-[#1D9E75] no-underline hover:text-[#0F6E56]"
          >
            {action.label} →
          </Link>
        ) : null}
      </div>
      <div className="erp-employee-section-body">{children}</div>
    </div>
  );
}

const ATTENTION_COLOR_CLASS: Record<'red' | 'amber' | 'blue', string> = {
  red: 'bg-[#FCEBEB] border-[#E24B4A]/20 text-[#C43D3C]',
  amber: 'bg-[#FAEEDA] border-[#BA7517]/20 text-[#BA7517]',
  blue: 'bg-[#E6F1FB] border-[#378ADD]/20 text-[#1A4A7A]',
};

/**
 * Portfolio "needs attention" alert list - colored rows, only non-zero items.
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
          <CheckCircleOutlined className="mb-2 text-3xl text-[#639922]" />
          <p className="erp-users-cell-sub m-0">
            All clear - nothing needs attention
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-lg border px-3 py-2.5 no-underline transition-opacity hover:opacity-80 ${ATTENTION_COLOR_CLASS[item.color]}`}
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
        <p className="erp-users-cell-sub m-0">No recent activity.</p>
      ) : (
        <div className="flex flex-col">
          {items.slice(0, 8).map((item, index) => (
            <Link
              key={`${item.type}-${item.date}-${index}`}
              href={item.link}
              className="-mx-1 flex items-start gap-3 rounded-lg px-1 py-2.5 no-underline transition-colors last:border-0 hover:bg-[#f8fafc]"
            >
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9]">
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {ACTIVITY_TYPE_ICON[item.type] ?? <BellOutlined />}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="erp-users-cell-strong m-0 truncate">{item.title}</p>
                <p className="erp-users-cell-sub m-0 mt-0.5">
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
