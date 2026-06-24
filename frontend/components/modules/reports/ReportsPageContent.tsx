'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Alert, Button, Col, Row, Table } from 'antd';
import {
  PrinterOutlined,
  ProjectOutlined,
  RiseOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PlaceholderPage from '@/components/PlaceholderPage';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import KPICard from '@/components/ui/KPICard/KPICard';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type { Project, ProjectStatus, ProjectType } from '@/lib/api/project-management.types';
import type { PortfolioSummary } from '@/lib/api/reporting.types';
import { usePortfolioSummary } from '@/lib/query/reports';
import { useAllProjects } from '@/lib/query/projects';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useAuthStore } from '@/stores/auth.store';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import {
  formatProjectStatus,
  formatProjectType,
  projectStatusVariant,
} from '@/lib/utils/project-display';
import { BarChart3 } from 'lucide-react';

const CHART_HEIGHT = 220;

const TOOLTIP_STYLE = {
  borderRadius: tokens.borderRadiusCard,
  border: `0.5px solid ${tokens.colorBorder}`,
  fontSize: 12,
};

const PROJECT_STATUS_COLORS: Record<string, string> = {
  PLANNING: tokens.colorBlue400,
  TENDER: tokens.colorTeal600,
  MOBILIZATION: tokens.colorAmber400,
  ACTIVE: tokens.colorGreen600,
  ON_HOLD: tokens.colorGray200,
  COMPLETED: tokens.colorGreen600,
  CLOSED: tokens.colorGray600,
};

const PROJECT_TYPE_COLORS: Record<string, string> = {
  RESIDENTIAL: tokens.colorTeal600,
  COMMERCIAL: tokens.colorBlue400,
  INFRASTRUCTURE: tokens.colorAmber400,
  INDUSTRIAL: tokens.colorRed600,
  UNSPECIFIED: tokens.colorGray200,
};

interface ChartDatum {
  name: string;
  value: number;
  color?: string;
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{
        borderRadius: tokens.borderRadiusCard,
        border: `0.5px solid ${tokens.colorBorder}`,
        background: tokens.colorCardBg,
      }}
    >
      <div
        className="shrink-0 px-[18px] py-[14px]"
        style={{ borderBottom: `0.5px solid ${tokens.colorBorder}` }}
      >
        <h3
          className="text-[13px] font-medium leading-[1.5]"
          style={{ color: tokens.colorTextPrimary }}
        >
          {title}
        </h3>
        <p
          className="mt-0.5 text-[10px] font-normal leading-[1.4]"
          style={{ color: tokens.colorTextTertiary }}
        >
          {subtitle}
        </p>
      </div>
      <div className="flex flex-1 flex-col px-[18px] py-4">
        <div style={{ width: '100%', height: CHART_HEIGHT }}>{children}</div>
      </div>
    </div>
  );
}

function ChartEmpty({ description }: { description: string }): React.ReactNode {
  return (
    <TableEmptyState
      icon={<BarChart3 />}
      title="No data"
      description={description}
    />
  );
}

function hasChartData(data: ChartDatum[]): boolean {
  return data.length > 0 && data.some((entry) => entry.value > 0);
}

function recordToChart(
  data: Record<string, number>,
  labelFn: (key: string) => string,
  colorFn: (key: string) => string,
): ChartDatum[] {
  return Object.entries(data)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      name: labelFn(key),
      value,
      color: colorFn(key),
    }));
}

function DonutChart({ data }: { data: ChartDatum[] }): React.ReactNode {
  if (!hasChartData(data)) {
    return <ChartEmpty description="Portfolio counts will appear when projects exist" />;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={52}
            outerRadius={78}
            paddingAngle={2}
            startAngle={90}
            endAngle={-270}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color ?? tokens.colorTeal600} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <div
        className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px]"
        style={{ color: tokens.colorTextSecondary }}
      >
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color ?? tokens.colorTeal600 }}
            />
            {item.name}
          </div>
        ))}
      </div>
    </>
  );
}

function TypePieChart({ data }: { data: ChartDatum[] }): React.ReactNode {
  if (!hasChartData(data)) {
    return <ChartEmpty description="Project type mix appears once projects are classified" />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          outerRadius={78}
          paddingAngle={1}
          label={({ name, percent }) =>
            percent != null && percent >= 0.08
              ? `${name} ${Math.round(percent * 100)}%`
              : ''
          }
          labelLine={false}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color ?? tokens.colorTeal600} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function HorizontalBarChart({ data }: { data: ChartDatum[] }): React.ReactNode {
  if (!hasChartData(data)) {
    return <ChartEmpty description="Organization metrics populate when setup data exists" />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
      >
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fill: tokens.colorTextTertiary, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={96}
          tick={{ fill: tokens.colorTextSecondary, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: tokens.colorSurfaceSecondary }} contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color ?? tokens.colorTeal600} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function RadarMetricChart({ data }: { data: ChartDatum[] }): React.ReactNode {
  if (!hasChartData(data)) {
    return <ChartEmpty description="Cross-project site metrics appear when PM data exists" />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
        <PolarGrid stroke={tokens.colorBorder} />
        <PolarAngleAxis
          dataKey="name"
          tick={{ fill: tokens.colorTextSecondary, fontSize: 10 }}
        />
        <Radar
          name="Count"
          dataKey="value"
          stroke={tokens.colorTeal600}
          fill={tokens.colorTeal600}
          fillOpacity={0.35}
          strokeWidth={2}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function CompletionGauge({ value }: { value: number }): React.ReactNode {
  const r = 90;
  const cx = 110;
  const cy = 125;
  const arcLength = Math.PI * r;
  const filled = (value / 100) * arcLength;

  return (
    <div className="flex h-full items-center justify-center">
      <svg width="220" height="150" viewBox="0 0 220 150">
        <path
          d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={tokens.colorGray100}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={tokens.colorGreen600}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${arcLength}`}
        />
        <text
          x={cx}
          y={cy - 16}
          textAnchor="middle"
          fontSize="24"
          fontWeight="500"
          fill={tokens.colorTextPrimary}
          fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        >
          {value}%
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fontSize="10"
          fill={tokens.colorTextTertiary}
          fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        >
          completed / closed
        </text>
      </svg>
    </div>
  );
}

function aggregateProjectsByStatus(projects: Project[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const project of projects) {
    counts[project.status] = (counts[project.status] ?? 0) + 1;
  }
  return counts;
}

function aggregateProjectsByType(projects: Project[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const project of projects) {
    const key = project.projectType ?? 'UNSPECIFIED';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function formatStatusLabel(status: string): string {
  if (status in PROJECT_STATUS_COLORS) {
    return formatProjectStatus(status as ProjectStatus);
  }
  return status;
}

function formatTypeLabel(type: string): string {
  if (type === 'UNSPECIFIED') {
    return 'Unspecified';
  }
  return formatProjectType(type as ProjectType);
}

function buildFallbackSummary(projects: Project[]): PortfolioSummary {
  const byStatus = aggregateProjectsByStatus(projects);
  const byType = aggregateProjectsByType(projects);
  const total = projects.length;
  const active = projects.filter((p) => p.status === 'ACTIVE').length;
  const completed = (byStatus.COMPLETED ?? 0) + (byStatus.CLOSED ?? 0);
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);

  return {
    generatedAt: new Date().toISOString(),
    completionRate,
    projects: { total, active, byStatus, byType },
    users: { total: 0, active: 0 },
    organization: { branches: 0, departments: 0 },
    audit: { last30Days: 0, total: 0 },
    siteOps: {
      openRfis: 0,
      overdueRfis: 0,
      openIssues: 0,
      openPunchItems: 0,
    },
  };
}

export default function ReportsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const canFetch = authHydrated && isAuthenticated;

  const summaryQuery = usePortfolioSummary(canFetch);
  const projectsQuery = useAllProjects({}, canFetch);

  const summaryApiUnavailable =
    summaryQuery.isError &&
    summaryQuery.error instanceof ApiRequestError &&
    (summaryQuery.error.status === 404 ||
      summaryQuery.error.status === 403 ||
      summaryQuery.error.status === 0);

  const projects = projectsQuery.data?.data ?? [];
  const summary = useMemo((): PortfolioSummary | null => {
    if (summaryQuery.data) {
      return summaryQuery.data;
    }
    if (summaryApiUnavailable && projects.length > 0) {
      return buildFallbackSummary(projects);
    }
    return null;
  }, [summaryQuery.data, summaryApiUnavailable, projects]);

  const statusChart = useMemo(
    () =>
      recordToChart(
        summary?.projects.byStatus ?? {},
        formatStatusLabel,
        (key) => PROJECT_STATUS_COLORS[key] ?? tokens.colorTeal600,
      ),
    [summary?.projects.byStatus],
  );

  const typeChart = useMemo(
    () =>
      recordToChart(
        summary?.projects.byType ?? {},
        formatTypeLabel,
        (key) => PROJECT_TYPE_COLORS[key] ?? tokens.colorTeal600,
      ),
    [summary?.projects.byType],
  );

  const orgChart = useMemo((): ChartDatum[] => {
    if (!summary) {
      return [];
    }
    return [
      {
        name: t('pages.systemReports.metrics.branches'),
        value: summary.organization.branches,
        color: tokens.colorTeal600,
      },
      {
        name: t('pages.systemReports.metrics.departments'),
        value: summary.organization.departments,
        color: tokens.colorBlue400,
      },
      {
        name: t('pages.systemReports.metrics.users'),
        value: summary.users.total,
        color: tokens.colorGreen600,
      },
      {
        name: t('pages.systemReports.metrics.activeUsers'),
        value: summary.users.active,
        color: tokens.colorAmber400,
      },
    ];
  }, [summary, t]);

  const siteOpsChart = useMemo((): ChartDatum[] => {
    if (!summary) {
      return [];
    }
    return [
      {
        name: t('pages.projectReports.metrics.openRfis'),
        value: summary.siteOps.openRfis,
        color: tokens.colorTeal600,
      },
      {
        name: t('pages.projectReports.metrics.overdueRfis'),
        value: summary.siteOps.overdueRfis,
        color: tokens.colorAmber400,
      },
      {
        name: t('pages.projectReports.metrics.openIssues'),
        value: summary.siteOps.openIssues,
        color: tokens.colorRed600,
      },
      {
        name: t('pages.projectReports.metrics.openPunch'),
        value: summary.siteOps.openPunchItems,
        color: tokens.colorBlue400,
      },
    ];
  }, [summary, t]);

  const projectColumns: ColumnsType<Project> = useMemo(
    () => [
      {
        title: t('pages.systemReports.table.code'),
        dataIndex: 'projectCode',
        key: 'projectCode',
        render: (code: string, record) => (
          <Link
            href={`/projects/${record.id}`}
            className="font-[family-name:var(--font-mono)] text-[12px] no-underline hover:underline"
            style={{ color: tokens.colorTeal600 }}
          >
            {code}
          </Link>
        ),
      },
      {
        title: t('pages.systemReports.table.name'),
        dataIndex: 'name',
        key: 'name',
        ellipsis: true,
      },
      {
        title: t('pages.systemReports.table.status'),
        dataIndex: 'status',
        key: 'status',
        render: (status: ProjectStatus) => (
          <StatusBadge
            label={formatProjectStatus(status)}
            variant={projectStatusVariant(status)}
          />
        ),
      },
      {
        title: t('pages.systemReports.table.progress'),
        dataIndex: 'overallProgressPct',
        key: 'overallProgressPct',
        align: 'right',
        render: (value: number | null) =>
          value != null ? `${value}%` : '-',
      },
      {
        title: '',
        key: 'reports',
        width: 100,
        render: (_value, record) => (
          <Link
            href={`/projects/${record.id}/overview/reports`}
            className="text-[12px] no-underline hover:underline"
            style={{ color: tokens.colorTeal600 }}
          >
            {t('pages.systemReports.table.reports')}
          </Link>
        ),
      },
    ],
    [t],
  );

  if (!authHydrated) {
    return <PageLoadingSkeleton />;
  }

  if (!isAuthenticated) {
    return (
      <PlaceholderPage
        icon={BarChart3}
        title={t('nav.reports')}
        description={t('pages.reports.signInRequired')}
      />
    );
  }

  if (summaryQuery.isLoading || projectsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!summary) {
    return (
      <PlaceholderPage
        icon={BarChart3}
        title={t('nav.reports')}
        description={t('pages.reports.description')}
      />
    );
  }

  return (
    <div className={`system-reports-page ${layout.pageStack}`}>
      <FormLayout
        title={t('pages.systemReports.title')}
        description={t('pages.systemReports.description')}
        extra={
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
            {t('pages.systemReports.print')}
          </Button>
        }
      >
        {summaryApiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title={t('pages.systemReports.partialDataTitle')}
            description={t('pages.systemReports.partialDataDescription')}
          />
        )}

        <div
          className="mb-4 grid gap-4 rounded-[12px] p-[18px] sm:grid-cols-2 lg:grid-cols-4"
          style={{
            border: `0.5px solid ${tokens.colorBorder}`,
            background: tokens.colorCardBg,
          }}
        >
          <div>
            <p
              className="text-[10px] font-medium uppercase tracking-[0.06em]"
              style={{ color: tokens.colorTextTertiary }}
            >
              {t('pages.systemReports.generatedAt')}
            </p>
            <p className="mt-1 text-[13px]" style={{ color: tokens.colorTextPrimary }}>
              {new Date(summary.generatedAt).toLocaleString()}
            </p>
          </div>
          <div>
            <p
              className="text-[10px] font-medium uppercase tracking-[0.06em]"
              style={{ color: tokens.colorTextTertiary }}
            >
              {t('pages.systemReports.metrics.totalProjects')}
            </p>
            <p
              className="mt-1 text-[18px] font-medium tabular-nums"
              style={{ color: tokens.colorTextPrimary }}
            >
              {summary.projects.total.toLocaleString()}
            </p>
          </div>
          <div>
            <p
              className="text-[10px] font-medium uppercase tracking-[0.06em]"
              style={{ color: tokens.colorTextTertiary }}
            >
              {t('pages.systemReports.metrics.completionRate')}
            </p>
            <p
              className="mt-1 text-[18px] font-medium tabular-nums"
              style={{ color: tokens.colorTextPrimary }}
            >
              {summary.completionRate}%
            </p>
          </div>
          <div>
            <p
              className="text-[10px] font-medium uppercase tracking-[0.06em]"
              style={{ color: tokens.colorTextTertiary }}
            >
              {t('pages.systemReports.metrics.auditLast30Days')}
            </p>
            <p
              className="mt-1 text-[18px] font-medium tabular-nums"
              style={{ color: tokens.colorTextPrimary }}
            >
              {summary.audit.last30Days.toLocaleString()}
            </p>
          </div>
        </div>

        <p
          className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: tokens.colorTextTertiary }}
        >
          {t('pages.systemReports.sections.portfolio')}
        </p>
        <Row gutter={[12, 12]} className="!mb-4">
          <Col xs={12} lg={6}>
            <KPICard
              label={t('pages.systemReports.metrics.totalProjects')}
              value={summary.projects.total.toLocaleString()}
              icon={ProjectOutlined}
              iconBg={tokens.colorTeal50}
              iconColor={tokens.colorTeal600}
            />
          </Col>
          <Col xs={12} lg={6}>
            <KPICard
              label={t('pages.systemReports.metrics.activeProjects')}
              value={summary.projects.active.toLocaleString()}
              icon={ProjectOutlined}
              iconBg={tokens.colorBlue50}
              iconColor={tokens.colorBlue400}
            />
          </Col>
          <Col xs={12} lg={6}>
            <KPICard
              label={t('pages.systemReports.metrics.teamMembers')}
              value={
                summary.users.total > 0
                  ? summary.users.total.toLocaleString()
                  : '-'
              }
              icon={TeamOutlined}
              iconBg={tokens.colorGreen50}
              iconColor={tokens.colorGreen600}
            />
          </Col>
          <Col xs={12} lg={6}>
            <KPICard
              label={t('pages.systemReports.metrics.completionRate')}
              value={`${summary.completionRate}%`}
              icon={RiseOutlined}
              iconBg={tokens.colorAmber50}
              iconColor={tokens.colorAmber400}
            />
          </Col>
        </Row>

        <p
          className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: tokens.colorTextTertiary }}
        >
          {t('pages.systemReports.sections.siteOps')}
        </p>
        <Row gutter={[12, 12]} className="!mb-4">
          <Col xs={12} lg={6}>
            <KPICard
              label={t('pages.projectReports.metrics.openRfis')}
              value={String(summary.siteOps.openRfis)}
              icon={ProjectOutlined}
              iconBg={tokens.colorTeal50}
              iconColor={tokens.colorTeal600}
            />
          </Col>
          <Col xs={12} lg={6}>
            <KPICard
              label={t('pages.projectReports.metrics.overdueRfis')}
              value={String(summary.siteOps.overdueRfis)}
              icon={RiseOutlined}
              iconBg={tokens.colorAmber50}
              iconColor={tokens.colorAmber400}
            />
          </Col>
          <Col xs={12} lg={6}>
            <KPICard
              label={t('pages.projectReports.metrics.openIssues')}
              value={String(summary.siteOps.openIssues)}
              icon={TeamOutlined}
              iconBg={tokens.colorRed50}
              iconColor={tokens.colorRed600}
            />
          </Col>
          <Col xs={12} lg={6}>
            <KPICard
              label={t('pages.projectReports.metrics.openPunch')}
              value={String(summary.siteOps.openPunchItems)}
              icon={ProjectOutlined}
              iconBg={tokens.colorBlue50}
              iconColor={tokens.colorBlue400}
            />
          </Col>
        </Row>

        <p
          className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: tokens.colorTextTertiary }}
        >
          {t('pages.systemReports.sections.charts')}
        </p>
        <div className={`${layout.cardGrid} mb-4 lg:grid-cols-2 xl:grid-cols-3`}>
          <ChartCard
            title={t('pages.systemReports.charts.projectsByStatus')}
            subtitle={t('pages.systemReports.charts.projectsByStatusHint')}
          >
            <DonutChart data={statusChart} />
          </ChartCard>
          <ChartCard
            title={t('pages.systemReports.charts.projectsByType')}
            subtitle={t('pages.systemReports.charts.projectsByTypeHint')}
          >
            <TypePieChart data={typeChart} />
          </ChartCard>
          <ChartCard
            title={t('pages.systemReports.charts.completionRate')}
            subtitle={t('pages.systemReports.charts.completionRateHint')}
          >
            <CompletionGauge value={summary.completionRate} />
          </ChartCard>
          <ChartCard
            title={t('pages.systemReports.charts.organization')}
            subtitle={t('pages.systemReports.charts.organizationHint')}
          >
            <HorizontalBarChart data={orgChart} />
          </ChartCard>
          <ChartCard
            title={t('pages.systemReports.charts.siteOpsPortfolio')}
            subtitle={t('pages.systemReports.charts.siteOpsPortfolioHint')}
          >
            <RadarMetricChart data={siteOpsChart} />
          </ChartCard>
        </div>

        <p
          className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: tokens.colorTextTertiary }}
        >
          {t('pages.systemReports.sections.projectRegister')}
        </p>
        <Table<Project>
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          dataSource={projects}
          columns={projectColumns}
          locale={{
            emptyText: (
              <ChartEmpty description="Create projects to populate the portfolio register" />
            ),
          }}
        />
      </FormLayout>
    </div>
  );
}
