'use client';

import Link from 'next/link';
import { Spin } from 'antd';
import {
  AuditOutlined,
  ExclamationCircleOutlined,
  FolderOutlined,
  QuestionCircleOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ComponentType, ReactNode } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type {
  MyDashboardActivityItem,
  PortfolioDashboardStats,
} from '@/lib/api/reporting.types';
import {
  colorForStatus,
  dashboardSemantic,
  PUNCH_FUNNEL_RAMP,
  type StatusSegment,
} from '@/lib/dashboard/semantic-colors';
import { useMyDashboard, usePortfolioDashboardStats } from '@/lib/query/dashboard';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';

dayjs.extend(relativeTime);

type IconComponent = ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}>;

type UrgencyKind = 'overdue' | 'critical' | 'pending' | null;

type KpiCardConfig = {
  key: string;
  label: string;
  /** Primary metric (open count / active count). */
  primaryValue: string;
  /** Quiet secondary line under the primary number when not urgent. */
  quietSubtext: string;
  /** Urgency metric shown larger when present. */
  urgencyValue: string | null;
  urgencyCaption: string | null;
  urgencyKind: UrgencyKind;
  link: string;
  icon: IconComponent;
};

type ChartSlice = {
  name: string;
  value: number;
  fill: string;
};

type BarDatum = {
  name: string;
  count: number;
  fill: string;
};

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): React.ReactNode {
  return (
    <div className={`${layout.cardSurface} ${layout.cardPadding}`}>
      <h3
        className="mb-4 text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]"
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function statusCount(
  map: Record<string, number> | undefined,
  key: string,
): number {
  return map?.[key] ?? 0;
}

function buildIssueSegments(stats: PortfolioDashboardStats): StatusSegment[] {
  return [
    {
      key: 'OPEN',
      label: 'Open',
      value: statusCount(stats.issuesByStatus, 'OPEN'),
      color: colorForStatus('OPEN'),
    },
    {
      key: 'IN_PROGRESS',
      label: 'In Progress',
      value: statusCount(stats.issuesByStatus, 'IN_PROGRESS'),
      color: colorForStatus('IN_PROGRESS'),
    },
    {
      key: 'CLOSED',
      label: 'Closed',
      value: statusCount(stats.issuesByStatus, 'CLOSED'),
      color: colorForStatus('CLOSED'),
    },
  ].filter((segment) => segment.value > 0);
}

function buildRiskSegments(stats: PortfolioDashboardStats): StatusSegment[] {
  return [
    {
      key: 'OPEN',
      label: 'Open',
      value: statusCount(stats.risksByStatus, 'OPEN'),
      color: colorForStatus('OPEN'),
    },
    {
      key: 'MITIGATED',
      label: 'Mitigated',
      value: statusCount(stats.risksByStatus, 'MITIGATED'),
      color: colorForStatus('MITIGATED'),
    },
    {
      key: 'ACCEPTED',
      label: 'Accepted',
      value: statusCount(stats.risksByStatus, 'ACCEPTED'),
      color: colorForStatus('ACCEPTED'),
    },
    {
      key: 'CLOSED',
      label: 'Closed',
      value: statusCount(stats.risksByStatus, 'CLOSED'),
      color: colorForStatus('CLOSED'),
    },
  ].filter((segment) => segment.value > 0);
}

function buildPunchBars(stats: PortfolioDashboardStats): BarDatum[] {
  const stages = [
    { name: 'Raised', key: 'RAISED' },
    { name: 'Assigned', key: 'ASSIGNED' },
    { name: 'Corrected', key: 'CORRECTED' },
    { name: 'Verified', key: 'VERIFIED' },
    { name: 'Closed', key: 'CLOSED' },
  ] as const;

  return stages.map((stage, index) => ({
    name: stage.name,
    count: statusCount(stats.punchByStatus, stage.key),
    fill: PUNCH_FUNNEL_RAMP[index] ?? dashboardSemantic.successStrong,
  }));
}

function buildProjectSlices(stats: PortfolioDashboardStats): ChartSlice[] {
  return [
    {
      name: 'Not Started',
      value: statusCount(stats.projectsByStatus, 'NOT_STARTED'),
      fill: colorForStatus('NOT_STARTED'),
    },
    {
      name: 'In Progress',
      value: statusCount(stats.projectsByStatus, 'IN_PROGRESS'),
      fill: colorForStatus('IN_PROGRESS'),
    },
    {
      name: 'On Hold',
      value: statusCount(stats.projectsByStatus, 'ON_HOLD'),
      fill: colorForStatus('ON_HOLD'),
    },
    {
      name: 'Completed',
      value: statusCount(stats.projectsByStatus, 'COMPLETED'),
      fill: colorForStatus('COMPLETED'),
    },
    {
      name: 'Cancelled',
      value: statusCount(stats.projectsByStatus, 'CANCELLED'),
      fill: colorForStatus('CANCELLED'),
    },
  ].filter((slice) => slice.value > 0);
}

/**
 * Horizontal stacked bar with inline count + status labels per segment.
 */
function StatusStackedBar({
  segments,
}: {
  segments: StatusSegment[];
}): React.ReactNode {
  if (segments.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">
        No data
      </p>
    );
  }

  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div className="flex flex-col gap-3 py-2">
      <div
        className="flex h-10 w-full overflow-hidden rounded-md"
        style={{ backgroundColor: tokens.colorSurfaceSecondary }}
        role="img"
        aria-label="Status distribution"
      >
        {segments.map((segment) => {
          const widthPct = total > 0 ? (segment.value / total) * 100 : 0;
          return (
            <div
              key={segment.key}
              className="flex min-w-0 items-center justify-center transition-[width]"
              style={{
                width: `${widthPct}%`,
                backgroundColor: segment.color,
                minWidth: widthPct > 0 ? 4 : 0,
              }}
              title={`${segment.label}: ${segment.value}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {segments.map((segment) => (
          <div key={segment.key} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: segment.color }}
            />
            <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
              {segment.value.toLocaleString()}
            </span>
            <span className="text-[12px] text-[var(--color-text-secondary)]">
              {segment.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectDonut({ data }: { data: ChartSlice[] }): React.ReactNode {
  if (data.length === 0) {
    return (
      <p className="flex h-[250px] items-center justify-center text-sm text-[var(--color-text-tertiary)]">
        No data
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function PunchBarChart({ data }: { data: BarDatum[] }): React.ReactNode {
  const hasData = data.some((row) => row.count > 0);
  if (!hasData) {
    return (
      <p className="flex h-[250px] items-center justify-center text-sm text-[var(--color-text-tertiary)]">
        No data
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data}>
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ActivityFeed({
  items,
}: {
  items: MyDashboardActivityItem[];
}): React.ReactNode {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-tertiary)]">
        No recent activity.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <Link
          key={`${item.type}-${item.date}-${item.title}`}
          href={item.link}
          className="flex gap-3 border-b border-[var(--color-border-tertiary)] py-2 last:border-b-0 hover:bg-[var(--color-surface-secondary)]"
        >
          <div className="w-[80px] shrink-0 text-xs text-[var(--color-text-tertiary)]">
            {dayjs(item.date).fromNow()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-[var(--color-text-primary)]">
              {item.title}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {item.type}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function OverdueAttention({
  stats,
}: {
  stats: PortfolioDashboardStats;
}): React.ReactNode {
  const items = [
    {
      key: 'issues',
      count: stats.overdueIssues,
      label: 'overdue issues',
      href: '/issues',
    },
    {
      key: 'rfis',
      count: stats.overdueRfis,
      label: 'overdue RFIs',
      href: '/rfis',
    },
    {
      key: 'punch',
      count: stats.overduePunchItems,
      label: 'overdue punch items',
      href: '/punch-list',
    },
  ].filter((item) => item.count > 0);

  if (items.length === 0) {
    return (
      <div
        className="rounded-lg px-4 py-3 text-sm"
        style={{
          border: `1px solid ${dashboardSemantic.success}`,
          backgroundColor: dashboardSemantic.successBg,
          color: dashboardSemantic.successStrong,
        }}
      >
        No overdue items. All on track.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:opacity-90"
          style={{
            border: `1px solid ${dashboardSemantic.danger}`,
            backgroundColor: dashboardSemantic.dangerBg,
            color: dashboardSemantic.dangerStrong,
          }}
        >
          <span>
            {item.count.toLocaleString()} {item.label}
          </span>
          <span className="text-xs uppercase tracking-wide">View</span>
        </Link>
      ))}
    </div>
  );
}

function buildKpiCards(stats: PortfolioDashboardStats): KpiCardConfig[] {
  const activeRisks =
    statusCount(stats.risksByStatus, 'OPEN') +
    statusCount(stats.risksByStatus, 'MITIGATED') +
    statusCount(stats.risksByStatus, 'ACCEPTED');

  return [
    {
      key: 'projects',
      label: 'Projects',
      primaryValue: stats.activeProjects.toLocaleString(),
      quietSubtext: `${stats.totalProjects.toLocaleString()} total`,
      urgencyValue: null,
      urgencyCaption: null,
      urgencyKind: null,
      link: '/projects',
      icon: FolderOutlined,
    },
    {
      key: 'issues',
      label: 'Open Issues',
      primaryValue: stats.openIssues.toLocaleString(),
      quietSubtext: `${stats.overdueIssues.toLocaleString()} overdue`,
      urgencyValue:
        stats.overdueIssues > 0 ? stats.overdueIssues.toLocaleString() : null,
      urgencyCaption: 'overdue',
      urgencyKind: stats.overdueIssues > 0 ? 'overdue' : null,
      link: '/issues',
      icon: ExclamationCircleOutlined,
    },
    {
      key: 'rfis',
      label: 'Open RFIs',
      primaryValue: stats.openRfis.toLocaleString(),
      quietSubtext: `${stats.overdueRfis.toLocaleString()} overdue`,
      urgencyValue:
        stats.overdueRfis > 0 ? stats.overdueRfis.toLocaleString() : null,
      urgencyCaption: 'overdue',
      urgencyKind: stats.overdueRfis > 0 ? 'overdue' : null,
      link: '/rfis',
      icon: QuestionCircleOutlined,
    },
    {
      key: 'risks',
      label: 'Active Risks',
      primaryValue: activeRisks.toLocaleString(),
      quietSubtext: `${stats.criticalRisks.toLocaleString()} critical`,
      urgencyValue:
        stats.criticalRisks > 0 ? stats.criticalRisks.toLocaleString() : null,
      urgencyCaption: 'critical',
      urgencyKind: stats.criticalRisks > 0 ? 'critical' : null,
      link: '/risks',
      icon: WarningOutlined,
    },
    {
      key: 'punch',
      label: 'Punch Items',
      primaryValue: stats.openPunchItems.toLocaleString(),
      quietSubtext: `${stats.overduePunchItems.toLocaleString()} overdue`,
      urgencyValue:
        stats.overduePunchItems > 0
          ? stats.overduePunchItems.toLocaleString()
          : null,
      urgencyCaption: 'overdue',
      urgencyKind: stats.overduePunchItems > 0 ? 'overdue' : null,
      link: '/punch-list',
      icon: ToolOutlined,
    },
    {
      key: 'reviews',
      label: 'Pending Reviews',
      primaryValue: stats.pendingReviews.toLocaleString(),
      quietSubtext: 'awaiting approval',
      urgencyValue: null,
      urgencyCaption: 'awaiting approval',
      urgencyKind: stats.pendingReviews > 0 ? 'pending' : null,
      link: '/review-inbox',
      icon: AuditOutlined,
    },
  ];
}

function KpiCard({ card }: { card: KpiCardConfig }): React.ReactNode {
  const Icon = card.icon;
  const isDanger =
    card.urgencyKind === 'overdue' || card.urgencyKind === 'critical';
  const isPending = card.urgencyKind === 'pending';

  const borderStyle = isDanger
    ? {
        borderLeft: `3px solid ${dashboardSemantic.danger}`,
        borderTop: `1px solid ${dashboardSemantic.quietBorder}`,
        borderRight: `1px solid ${dashboardSemantic.quietBorder}`,
        borderBottom: `1px solid ${dashboardSemantic.quietBorder}`,
        borderRadius: '0 8px 8px 0',
      }
    : {
        border: `1px solid ${dashboardSemantic.quietBorder}`,
        borderRadius: 8,
      };

  return (
    <Link href={card.link} className="block h-full">
      <div
        className="h-full cursor-pointer bg-white p-4 transition-shadow hover:shadow-sm"
        style={borderStyle}
      >
        <div className="mb-3 flex items-center gap-2">
          <Icon
            className="text-[13px]"
            style={{
              color: isDanger
                ? dashboardSemantic.danger
                : tokens.colorTextSecondary,
            }}
          />
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
            {card.label}
          </span>
        </div>

        {isDanger && card.urgencyValue ? (
          <div className="flex flex-col gap-1">
            <p
              className="text-[28px] font-bold leading-none tracking-[-0.03em]"
              style={{ color: dashboardSemantic.dangerStrong }}
            >
              {card.urgencyValue}
            </p>
            <p
              className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: dashboardSemantic.danger }}
            >
              {card.urgencyCaption}
            </p>
            <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
              <span className="font-medium text-[var(--color-text-primary)]">
                {card.primaryValue}
              </span>{' '}
              {card.key === 'risks' ? 'active' : 'open'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <p
              className="text-[22px] font-semibold leading-none tracking-[-0.02em]"
              style={{ color: tokens.colorTextPrimary }}
            >
              {card.primaryValue}
            </p>
            <p
              className="text-[11px]"
              style={{
                color: isPending
                  ? dashboardSemantic.warning
                  : tokens.colorTextTertiary,
              }}
            >
              {card.quietSubtext}
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}

/**
 * Company-wide portfolio dashboard for full-access roles.
 */
export default function PortfolioDashboard({
  enabled = true,
}: {
  enabled?: boolean;
}): React.ReactNode {
  const portfolioQuery = usePortfolioDashboardStats(enabled);
  const myQuery = useMyDashboard(enabled);
  const stats = portfolioQuery.data;
  const loading = portfolioQuery.isLoading || portfolioQuery.isFetching;

  if (loading && !stats) {
    return (
      <div className={layout.loadingCard}>
        <Spin />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={`${layout.cardSurface} ${layout.cardPadding}`}>
        <p className="text-sm text-[var(--color-text-tertiary)]">
          Unable to load portfolio dashboard.
        </p>
      </div>
    );
  }

  const cards = buildKpiCards(stats);
  const activity = myQuery.data?.recentActivity ?? [];

  return (
    <div className={layout.sectionStack}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <KpiCard key={card.key} card={card} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Issues by Status">
          <StatusStackedBar segments={buildIssueSegments(stats)} />
        </SectionCard>
        <SectionCard title="Risks by Status">
          <StatusStackedBar segments={buildRiskSegments(stats)} />
        </SectionCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Punch Items by Status">
          <PunchBarChart data={buildPunchBars(stats)} />
        </SectionCard>
        <SectionCard title="Projects by Status">
          <ProjectDonut data={buildProjectSlices(stats)} />
        </SectionCard>
      </div>

      <div
        className={`grid gap-4 ${activity.length > 0 ? 'md:grid-cols-2' : ''}`}
      >
        {activity.length > 0 ? (
          <SectionCard title="Recent Activity">
            <ActivityFeed items={activity} />
          </SectionCard>
        ) : null}
        <SectionCard title="Attention Needed">
          <OverdueAttention stats={stats} />
        </SectionCard>
      </div>
    </div>
  );
}
