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
import { useMyDashboard, usePortfolioDashboardStats } from '@/lib/query/dashboard';
import { layout } from '@/lib/theme/layout';

dayjs.extend(relativeTime);

type IconComponent = ComponentType<{ className?: string }>;

type KpiCardConfig = {
  key: string;
  label: string;
  value: string;
  subtext: string;
  subtextDanger: boolean;
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
      <h3 className="mb-3 text-sm font-medium text-[var(--color-text-primary)]">
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

function buildIssueSlices(stats: PortfolioDashboardStats): ChartSlice[] {
  return [
    {
      name: 'Open',
      value: statusCount(stats.issuesByStatus, 'OPEN'),
      fill: '#f59e0b',
    },
    {
      name: 'In Progress',
      value: statusCount(stats.issuesByStatus, 'IN_PROGRESS'),
      fill: '#3b82f6',
    },
    {
      name: 'Closed',
      value: statusCount(stats.issuesByStatus, 'CLOSED'),
      fill: '#10b981',
    },
  ].filter((slice) => slice.value > 0);
}

function buildRiskSlices(stats: PortfolioDashboardStats): ChartSlice[] {
  return [
    {
      name: 'Open',
      value: statusCount(stats.risksByStatus, 'OPEN'),
      fill: '#f59e0b',
    },
    {
      name: 'Mitigated',
      value: statusCount(stats.risksByStatus, 'MITIGATED'),
      fill: '#3b82f6',
    },
    {
      name: 'Accepted',
      value: statusCount(stats.risksByStatus, 'ACCEPTED'),
      fill: '#8b5cf6',
    },
    {
      name: 'Closed',
      value: statusCount(stats.risksByStatus, 'CLOSED'),
      fill: '#10b981',
    },
  ].filter((slice) => slice.value > 0);
}

function buildPunchBars(stats: PortfolioDashboardStats): BarDatum[] {
  return [
    {
      name: 'Raised',
      count: statusCount(stats.punchByStatus, 'RAISED'),
      fill: '#6b7280',
    },
    {
      name: 'Assigned',
      count: statusCount(stats.punchByStatus, 'ASSIGNED'),
      fill: '#3b82f6',
    },
    {
      name: 'Corrected',
      count: statusCount(stats.punchByStatus, 'CORRECTED'),
      fill: '#f59e0b',
    },
    {
      name: 'Verified',
      count: statusCount(stats.punchByStatus, 'VERIFIED'),
      fill: '#10b981',
    },
    {
      name: 'Closed',
      count: statusCount(stats.punchByStatus, 'CLOSED'),
      fill: '#059669',
    },
  ];
}

function buildProjectSlices(stats: PortfolioDashboardStats): ChartSlice[] {
  return [
    {
      name: 'Not Started',
      value: statusCount(stats.projectsByStatus, 'NOT_STARTED'),
      fill: '#6b7280',
    },
    {
      name: 'In Progress',
      value: statusCount(stats.projectsByStatus, 'IN_PROGRESS'),
      fill: '#3b82f6',
    },
    {
      name: 'On Hold',
      value: statusCount(stats.projectsByStatus, 'ON_HOLD'),
      fill: '#f59e0b',
    },
    {
      name: 'Completed',
      value: statusCount(stats.projectsByStatus, 'COMPLETED'),
      fill: '#10b981',
    },
    {
      name: 'Cancelled',
      value: statusCount(stats.projectsByStatus, 'CANCELLED'),
      fill: '#ef4444',
    },
  ].filter((slice) => slice.value > 0);
}

function DonutChart({ data }: { data: ChartSlice[] }): React.ReactNode {
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
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
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
          className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:border-red-300"
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
      value: stats.activeProjects.toLocaleString(),
      subtext: `${stats.totalProjects.toLocaleString()} total`,
      subtextDanger: false,
      link: '/projects',
      icon: FolderOutlined,
    },
    {
      key: 'issues',
      label: 'Open Issues',
      value: stats.openIssues.toLocaleString(),
      subtext: `${stats.overdueIssues.toLocaleString()} overdue`,
      subtextDanger: stats.overdueIssues > 0,
      link: '/issues',
      icon: ExclamationCircleOutlined,
    },
    {
      key: 'rfis',
      label: 'Open RFIs',
      value: stats.openRfis.toLocaleString(),
      subtext: `${stats.overdueRfis.toLocaleString()} overdue`,
      subtextDanger: stats.overdueRfis > 0,
      link: '/rfis',
      icon: QuestionCircleOutlined,
    },
    {
      key: 'risks',
      label: 'Active Risks',
      value: activeRisks.toLocaleString(),
      subtext: `${stats.criticalRisks.toLocaleString()} critical`,
      subtextDanger: stats.criticalRisks > 0,
      link: '/risks',
      icon: WarningOutlined,
    },
    {
      key: 'punch',
      label: 'Punch Items',
      value: stats.openPunchItems.toLocaleString(),
      subtext: `${stats.overduePunchItems.toLocaleString()} overdue`,
      subtextDanger: stats.overduePunchItems > 0,
      link: '/punch-list',
      icon: ToolOutlined,
    },
    {
      key: 'reviews',
      label: 'Pending Reviews',
      value: stats.pendingReviews.toLocaleString(),
      subtext: 'awaiting approval',
      subtextDanger: false,
      link: '/review-inbox',
      icon: AuditOutlined,
    },
  ];
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
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.key} href={card.link} className="block">
              <div className="cursor-pointer rounded-lg border border-[var(--color-border-tertiary)] p-4 transition-shadow hover:shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Icon className="text-[var(--color-text-secondary)]" />
                  <span className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    {card.label}
                  </span>
                </div>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                  {card.value}
                </p>
                <p
                  className={`text-xs ${
                    card.subtextDanger
                      ? 'text-red-600'
                      : 'text-[var(--color-text-tertiary)]'
                  }`}
                >
                  {card.subtext}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Issues by Status">
          <DonutChart data={buildIssueSlices(stats)} />
        </SectionCard>
        <SectionCard title="Risks by Status">
          <DonutChart data={buildRiskSlices(stats)} />
        </SectionCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Punch Items by Status">
          <PunchBarChart data={buildPunchBars(stats)} />
        </SectionCard>
        <SectionCard title="Projects by Status">
          <DonutChart data={buildProjectSlices(stats)} />
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
