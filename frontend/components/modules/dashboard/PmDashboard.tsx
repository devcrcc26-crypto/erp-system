'use client';

import { Spin } from 'antd';
import {
  CheckSquareOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  FolderOutlined,
  QuestionCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CHART_AXIS_STYLE,
  CHART_GRID_COLOR,
  CHART_TOOLTIP_CURSOR,
  CHART_TOOLTIP_STYLE,
  AttentionNeeded,
  ChartCard,
  RecentActivity,
  StatCard,
} from '@/components/modules/dashboard/DashboardStats';
import type { PortfolioDashboardStats } from '@/lib/api/reporting.types';
import { useMyDashboard, usePortfolioDashboardStats } from '@/lib/query/dashboard';

function statusCount(map: Record<string, number> | undefined, key: string): number {
  return map?.[key] ?? 0;
}

function ProjectStatusDonut({
  stats,
}: {
  stats: PortfolioDashboardStats;
}): React.ReactNode {
  const data = [
    { name: 'In Progress', value: statusCount(stats.projectsByStatus, 'IN_PROGRESS'), fill: '#1D9E75' },
    { name: 'Completed', value: statusCount(stats.projectsByStatus, 'COMPLETED'), fill: '#639922' },
    { name: 'Not Started', value: statusCount(stats.projectsByStatus, 'NOT_STARTED'), fill: '#D3D1C7' },
    { name: 'On Hold', value: statusCount(stats.projectsByStatus, 'ON_HOLD'), fill: '#BA7517' },
    { name: 'Cancelled', value: statusCount(stats.projectsByStatus, 'CANCELLED'), fill: '#E24B4A' },
  ].filter((slice) => slice.value > 0);

  return (
    <ChartCard
      title="Project Status"
      subtitle={`${stats.totalProjects} total projects`}
      icon={<FolderOutlined />}
    >
      {data.length === 0 ? (
        <p className="flex h-[200px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
          No data
        </p>
      ) : (
        <div className="relative">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={90}
                paddingAngle={2}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ fontSize: 11, color: '#5F5E5A' }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
            <p className="text-2xl font-bold text-[var(--color-text-primary)] m-0">
              {stats.activeProjects}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)] m-0">Active</p>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function RiskBreakdown({
  stats,
}: {
  stats: PortfolioDashboardStats;
}): React.ReactNode {
  const data = [
    { name: 'Open', value: statusCount(stats.risksByStatus, 'OPEN'), fill: '#E24B4A' },
    { name: 'Mitigated', value: statusCount(stats.risksByStatus, 'MITIGATED'), fill: '#BA7517' },
    { name: 'Accepted', value: statusCount(stats.risksByStatus, 'ACCEPTED'), fill: '#378ADD' },
    { name: 'Closed', value: statusCount(stats.risksByStatus, 'CLOSED'), fill: '#639922' },
  ];
  const hasData = data.some((row) => row.value > 0);

  return (
    <ChartCard title="Risk Breakdown" subtitle="By current status" icon={<WarningOutlined />}>
      {!hasData ? (
        <p className="flex h-[200px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
          No data
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20, top: 8, bottom: 8 }}>
            <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={80} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
            <Tooltip cursor={CHART_TOOLTIP_CURSOR} contentStyle={CHART_TOOLTIP_STYLE} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function IssuesByStatus({
  stats,
}: {
  stats: PortfolioDashboardStats;
}): React.ReactNode {
  const data = [
    { name: 'Open', value: statusCount(stats.issuesByStatus, 'OPEN'), fill: '#E24B4A' },
    { name: 'In Progress', value: statusCount(stats.issuesByStatus, 'IN_PROGRESS'), fill: '#BA7517' },
    { name: 'Closed', value: statusCount(stats.issuesByStatus, 'CLOSED'), fill: '#639922' },
  ];
  const hasData = data.some((row) => row.value > 0);

  return (
    <ChartCard
      title="Issues by Status"
      subtitle="Open, in progress, and closed"
      icon={<ExclamationCircleOutlined />}
    >
      {!hasData ? (
        <p className="flex h-[200px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
          No data
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20, top: 8, bottom: 8 }}>
            <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={80} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
            <Tooltip cursor={CHART_TOOLTIP_CURSOR} contentStyle={CHART_TOOLTIP_STYLE} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function PunchListByStatus({
  stats,
}: {
  stats: PortfolioDashboardStats;
}): React.ReactNode {
  const data = [
    { name: 'Raised', value: statusCount(stats.punchByStatus, 'RAISED'), fill: '#E24B4A' },
    { name: 'Assigned', value: statusCount(stats.punchByStatus, 'ASSIGNED'), fill: '#BA7517' },
    { name: 'Corrected', value: statusCount(stats.punchByStatus, 'CORRECTED'), fill: '#378ADD' },
    { name: 'Verified', value: statusCount(stats.punchByStatus, 'VERIFIED'), fill: '#639922' },
    { name: 'Closed', value: statusCount(stats.punchByStatus, 'CLOSED'), fill: '#B8B6AE' },
  ];
  const hasData = data.some((row) => row.value > 0);

  return (
    <ChartCard
      title="Punch List by Status"
      subtitle="Current distribution"
      icon={<CheckSquareOutlined />}
    >
      {!hasData ? (
        <p className="flex h-[200px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
          No data
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
            <Tooltip cursor={CHART_TOOLTIP_CURSOR} contentStyle={CHART_TOOLTIP_STYLE} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/**
 * Company-wide PM dashboard - KPI row, status charts, attention needed, recent activity.
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
      <div className="erp-pro-list-page erp-users-page erp-dashboard-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-dashboard-page">
        <div className="erp-pro-card p-6">
          <p className="erp-users-cell-sub m-0">
            Unable to load portfolio dashboard.
          </p>
        </div>
      </div>
    );
  }

  const activity = myQuery.data?.recentActivity ?? [];

  return (
    <div className="erp-pro-list-page erp-users-page erp-dashboard-page">
      <div className="erp-users-stat-bar erp-dashboard-stat-bar--6">
        <StatCard
          label="Active Projects"
          value={stats.activeProjects}
          sub={`of ${stats.totalProjects} total`}
          color="teal"
          icon={<FolderOutlined />}
          href="/projects"
        />
        <StatCard
          label="Open Issues"
          value={stats.openIssues}
          sub={stats.overdueIssues > 0 ? `${stats.overdueIssues} overdue` : 'None overdue'}
          color={stats.overdueIssues > 0 ? 'red' : 'default'}
          icon={<ExclamationCircleOutlined />}
          href="/issues"
        />
        <StatCard
          label="Open RFIs"
          value={stats.openRfis}
          sub={stats.overdueRfis > 0 ? `${stats.overdueRfis} overdue` : 'None overdue'}
          color={stats.overdueRfis > 0 ? 'red' : 'default'}
          icon={<QuestionCircleOutlined />}
          href="/rfis"
        />
        <StatCard
          label="Active Risks"
          value={stats.openRisks}
          sub={stats.criticalRisks > 0 ? `${stats.criticalRisks} critical` : 'None critical'}
          color={stats.criticalRisks > 0 ? 'amber' : 'default'}
          icon={<WarningOutlined />}
          href="/risks"
        />
        <StatCard
          label="Punch Items"
          value={stats.openPunchItems}
          sub={stats.overduePunchItems > 0 ? `${stats.overduePunchItems} overdue` : 'None overdue'}
          color={stats.overduePunchItems > 0 ? 'red' : 'default'}
          icon={<CheckSquareOutlined />}
          href="/punch-list"
        />
        <StatCard
          label="Pending Reviews"
          value={stats.pendingReviews}
          sub="awaiting approval"
          color={stats.pendingReviews > 0 ? 'blue' : 'default'}
          icon={<EyeOutlined />}
          href="/review-inbox"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <ProjectStatusDonut stats={stats} />
        <RiskBreakdown stats={stats} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <IssuesByStatus stats={stats} />
        <PunchListByStatus stats={stats} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <AttentionNeeded stats={stats} />
        <RecentActivity items={activity} />
      </div>
    </div>
  );
}
