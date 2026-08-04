'use client';

import { useState } from 'react';
import { Collapse, Spin } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
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
import FilterSection from '@/components/FilterSection';
import DashboardCharts from '@/components/charts/DashboardCharts';
import {
  AttentionNeeded,
  ChartCard,
  SectionCard,
  StatCard,
} from '@/components/modules/dashboard/DashboardStats';
import type { PortfolioDashboardStats } from '@/lib/api/reporting.types';
import { DEFAULT_DASHBOARD_FILTERS, type DashboardFilters } from '@/lib/dashboard/types';
import { useMyDashboard, usePortfolioDashboard, usePortfolioDashboardStats } from '@/lib/query/dashboard';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { formatLocalizedName } from '@/lib/utils/bilingual-name';

dayjs.extend(relativeTime);

function statusCount(map: Record<string, number> | undefined, key: string): number {
  return map?.[key] ?? 0;
}

function ProjectStatusChart({
  stats,
}: {
  stats: PortfolioDashboardStats;
}): React.ReactNode {
  const data = [
    { name: 'In Progress', value: statusCount(stats.projectsByStatus, 'IN_PROGRESS'), fill: tokens.colorTeal400 },
    { name: 'Not Started', value: statusCount(stats.projectsByStatus, 'NOT_STARTED'), fill: tokens.colorGray200 },
    { name: 'On Hold', value: statusCount(stats.projectsByStatus, 'ON_HOLD'), fill: tokens.colorAmber400 },
    { name: 'Completed', value: statusCount(stats.projectsByStatus, 'COMPLETED'), fill: tokens.colorGreen400 },
    { name: 'Cancelled', value: statusCount(stats.projectsByStatus, 'CANCELLED'), fill: tokens.colorRed400 },
  ].filter((slice) => slice.value > 0);

  if (data.length === 0) {
    return (
      <p className="flex h-[220px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
        No data
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90}>
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

function RiskBreakdownChart({
  stats,
}: {
  stats: PortfolioDashboardStats;
}): React.ReactNode {
  const data = [
    { name: 'Open', value: statusCount(stats.risksByStatus, 'OPEN'), fill: tokens.colorRed400 },
    { name: 'Mitigated', value: statusCount(stats.risksByStatus, 'MITIGATED'), fill: tokens.colorAmber400 },
    { name: 'Accepted', value: statusCount(stats.risksByStatus, 'ACCEPTED'), fill: tokens.colorBlue400 },
    { name: 'Closed', value: statusCount(stats.risksByStatus, 'CLOSED'), fill: tokens.colorGreen400 },
  ];

  const hasData = data.some((row) => row.value > 0);
  if (!hasData) {
    return (
      <p className="flex h-[220px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
        No data
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical">
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function IssuesByStatusChart({
  stats,
}: {
  stats: PortfolioDashboardStats;
}): React.ReactNode {
  const data = [
    {
      name: 'Issues',
      Open: statusCount(stats.issuesByStatus, 'OPEN'),
      'In Progress': statusCount(stats.issuesByStatus, 'IN_PROGRESS'),
      Closed: statusCount(stats.issuesByStatus, 'CLOSED'),
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="Open" stackId="a" fill={tokens.colorRed400} />
        <Bar dataKey="In Progress" stackId="a" fill={tokens.colorAmber400} />
        <Bar dataKey="Closed" stackId="a" fill={tokens.colorGreen400} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PunchByStatusChart({
  stats,
}: {
  stats: PortfolioDashboardStats;
}): React.ReactNode {
  const data = [
    { name: 'Raised', value: statusCount(stats.punchByStatus, 'RAISED') },
    { name: 'Assigned', value: statusCount(stats.punchByStatus, 'ASSIGNED') },
    { name: 'Corrected', value: statusCount(stats.punchByStatus, 'CORRECTED') },
    { name: 'Verified', value: statusCount(stats.punchByStatus, 'VERIFIED') },
    { name: 'Closed', value: statusCount(stats.punchByStatus, 'CLOSED') },
  ];

  const hasData = data.some((row) => row.value > 0);
  if (!hasData) {
    return (
      <p className="flex h-[220px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
        No data
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="value" fill={tokens.colorTeal400} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ScheduleOverviewSection({ enabled }: { enabled: boolean }): React.ReactNode {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_DASHBOARD_FILTERS);
  const dashboard = usePortfolioDashboard(filters, enabled);

  const projectOptions = dashboard.projects.map((project) => ({
    value: project.id,
    label: `${project.projectCode} — ${formatLocalizedName(project)}`,
  }));

  return (
    <Collapse
      className="dashboard-schedule-collapse overflow-hidden rounded-lg border border-[rgba(0,0,0,0.08)] bg-white [&_.ant-collapse-header]:!items-center [&_.ant-collapse-content-box]:!px-5 [&_.ant-collapse-content-box]:!pb-5"
      bordered={false}
      items={[
        {
          key: 'schedule-overview',
          label: (
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              Schedule Overview
            </span>
          ),
          children: (
            <div className={layout.sectionStack}>
              <FilterSection
                filters={filters}
                onChange={setFilters}
                projectOptions={projectOptions}
                disciplineOptions={dashboard.disciplineOptions}
              />
              <DashboardCharts
                data={dashboard.chartData}
                loading={dashboard.isLoading || dashboard.isFetching}
                taskCount={dashboard.filteredTaskCount}
              />
            </div>
          ),
        },
      ]}
    />
  );
}

/**
 * Company-wide PM dashboard — KPI row, status charts, attention needed, recent activity.
 */
export default function PmDashboard({
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
        <p className="text-sm text-[var(--color-text-tertiary)] m-0">
          Unable to load portfolio dashboard.
        </p>
      </div>
    );
  }

  const activity = myQuery.data?.recentActivity ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Active Projects"
          value={stats.activeProjects}
          total={stats.totalProjects}
          color="teal"
          href="/projects"
        />
        <StatCard
          label="Open Issues"
          value={stats.openIssues}
          sub={`${stats.overdueIssues} overdue`}
          color={stats.overdueIssues > 0 ? 'red' : 'default'}
          href="/issues"
        />
        <StatCard
          label="Open RFIs"
          value={stats.openRfis}
          sub={`${stats.overdueRfis} overdue`}
          color={stats.overdueRfis > 0 ? 'red' : 'default'}
          href="/rfis"
        />
        <StatCard
          label="Active Risks"
          value={stats.openRisks}
          sub={`${stats.criticalRisks} critical`}
          color={stats.criticalRisks > 0 ? 'amber' : 'default'}
          href="/risks"
        />
        <StatCard
          label="Punch Items"
          value={stats.openPunchItems}
          sub={`${stats.overduePunchItems} overdue`}
          color={stats.overduePunchItems > 0 ? 'red' : 'default'}
          href="/punch-list"
        />
        <StatCard
          label="Pending Reviews"
          value={stats.pendingReviews}
          color="blue"
          href="/review-inbox"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Project Status">
          <ProjectStatusChart stats={stats} />
        </ChartCard>
        <ChartCard title="Risk Breakdown">
          <RiskBreakdownChart stats={stats} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Issues by Status">
          <IssuesByStatusChart stats={stats} />
        </ChartCard>
        <ChartCard title="Punch List by Status">
          <PunchByStatusChart stats={stats} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Attention Needed">
          <AttentionNeeded stats={stats} />
        </SectionCard>
        <SectionCard title="Recent Activity">
          {activity.length === 0 ? (
            <p className="text-sm text-[var(--color-text-tertiary)] m-0">
              No recent activity.
            </p>
          ) : (
            <div className="flex flex-col">
              {activity.map((item) => (
                <a
                  key={`${item.type}-${item.date}-${item.title}`}
                  href={item.link}
                  className="flex gap-3 border-b border-[var(--color-border-tertiary)] py-2 last:border-b-0 hover:bg-[var(--color-surface-secondary)]"
                >
                  <div className="w-[80px] shrink-0 text-xs text-[var(--color-text-tertiary)]">
                    {dayjs(item.date).fromNow()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--color-text-primary)] m-0">
                      {item.title}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] m-0">
                      {item.type}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <ScheduleOverviewSection enabled={enabled} />
    </div>
  );
}
