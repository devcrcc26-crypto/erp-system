'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Col, Row, Table } from 'antd';
import { FilePdfOutlined, CalendarOutlined } from '@ant-design/icons';
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
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import KPICard from '@/components/ui/KPICard/KPICard';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { getNavIconComponent } from '@/lib/navigation/nav-icons';
import { projectNavHref } from '@/lib/navigation/project-workspace-nav';
import { ApiRequestError } from '@/lib/api/errors';
import type { Task, TaskStatus } from '@/lib/api/project-management.types';
import type { ProjectReportPdfLabels } from '@/lib/api/reporting.types';
import { useProject, useProjectDashboardStats } from '@/lib/query/projects';
import { useProjectStatusBoard } from '@/lib/query/epc-workspace';
import { useAllTasks, useScheduleSubtasks } from '@/lib/query/schedule';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import {
  formatProjectBudget,
  formatProjectDate,
  formatProjectStatus,
  projectStatusVariant,
} from '@/lib/utils/project-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import { formatProjectedStatus } from '@/lib/utils/epc-display';
import { formatTaskStatus } from '@/lib/utils/pm-status-display';
import {
  computeScheduleMetrics,
  type ScheduleMetrics,
} from '@/lib/utils/schedule-metrics';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { useAuthStore } from '@/stores/auth.store';
import { openProjectReportPdf } from '@/lib/query/projects';
import { formatUserName } from '@/lib/utils/user-display';
import { BarChart3 } from 'lucide-react';

const CHART_HEIGHT = 220;

const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  NOT_STARTED: tokens.colorGray200,
  IN_PROGRESS: tokens.colorTeal600,
  DELAYED: tokens.colorAmber400,
  COMPLETED: tokens.colorGreen600,
};

const PROJECTED_STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: tokens.colorTeal600,
  PENDING_LEAD: tokens.colorAmber400,
  APPROVED: tokens.colorGreen600,
  REWORK_REQUIRED: tokens.colorRed600,
};

const TOOLTIP_STYLE = {
  borderRadius: tokens.borderRadiusCard,
  border: `0.5px solid ${tokens.colorBorder}`,
  fontSize: 12,
};

interface ChartDatum {
  name: string;
  value: number;
  color?: string;
}

interface ModuleSummaryRow {
  key: string;
  module: string;
  metric: string;
  href: string;
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

function ChartEmpty(): React.ReactNode {
  return (
    <TableEmptyState
      icon={<BarChart3 />}
      title="No data"
      description="Counts will appear when records exist for this project"
    />
  );
}

function hasChartData(data: ChartDatum[]): boolean {
  return data.length > 0 && data.some((entry) => entry.value > 0);
}

function ChartLegend({ data }: { data: ChartDatum[] }): React.ReactNode {
  return (
    <div
      className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] font-normal"
      style={{ color: tokens.colorTextSecondary }}
    >
      {data.map((item) => (
        <div key={item.name} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: item.color ?? tokens.colorTeal600 }}
          />
          <span>{item.name}</span>
        </div>
      ))}
    </div>
  );
}

/** Donut chart - task status mix */
function TaskStatusDonutChart({ data }: { data: ChartDatum[] }): React.ReactNode {
  if (!hasChartData(data)) {
    return <ChartEmpty />;
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
      <ChartLegend data={data.filter((entry) => entry.value > 0)} />
    </>
  );
}

/** Horizontal bar chart - site operations counts */
function SiteOpsHorizontalChart({ data }: { data: ChartDatum[] }): React.ReactNode {
  if (!hasChartData(data)) {
    return <ChartEmpty />;
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
          width={88}
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

/** Full pie chart - design package status split */
function PackagePieChart({ data }: { data: ChartDatum[] }): React.ReactNode {
  if (!hasChartData(data)) {
    return <ChartEmpty />;
  }

  return (
    <>
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
    </>
  );
}

/** Radar chart - discipline status profile */
function DisciplineRadarChart({ data }: { data: ChartDatum[] }): React.ReactNode {
  if (!hasChartData(data)) {
    return <ChartEmpty />;
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

function countTasksByStatus(tasks: Task[]): ChartDatum[] {
  const counts: Record<TaskStatus, number> = {
    NOT_STARTED: 0,
    IN_PROGRESS: 0,
    DELAYED: 0,
    COMPLETED: 0,
  };

  for (const task of tasks) {
    counts[task.status] += 1;
  }

  return (Object.keys(counts) as TaskStatus[]).map((status) => ({
    name: formatTaskStatus(status),
    value: counts[status],
    color: TASK_STATUS_COLORS[status],
  }));
}

function recordCountsToChart(
  data: Record<string, number>,
  labelFormatter: (key: string) => string,
): ChartDatum[] {
  return Object.entries(data)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      name: labelFormatter(key),
      value,
      color: PROJECTED_STATUS_COLORS[key] ?? tokens.colorTeal600,
    }));
}

function formatCount(value: number | undefined, available: boolean): string {
  if (available && value != null) {
    return String(value);
  }
  return '-';
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) {
    return '-';
  }
  return `${value}%`;
}

function chartToBreakdownRows(data: ChartDatum[]): { label: string; count: number }[] {
  return data
    .filter((entry) => entry.value > 0)
    .map((entry) => ({ label: entry.name, count: entry.value }));
}

function buildProjectReportPdfLabels(
  t: (key: string) => string,
): ProjectReportPdfLabels {
  return {
    title: t('pages.projectReports.title'),
    subtitle: t('pages.projectReports.description'),
    preparedBy: t('pages.projectReports.preparedBy'),
    generatedAt: t('pages.projectReports.generatedAt'),
    projectOverview: t('pages.projectReports.sections.projectOverview'),
    projectCode: t('pages.projectReports.projectCode'),
    projectName: t('pages.projectReports.projectName'),
    status: t('pages.projectReports.status'),
    plannedFinish: t('pages.projectReports.plannedFinish'),
    budget: t('pages.projectReports.budget'),
    overallProgress: t('pages.projectReports.overallProgress'),
    siteOps: t('pages.projectReports.sections.siteOps'),
    siteOpsBreakdown: t('pages.projectReports.breakdown.siteOpsBreakdown'),
    schedule: t('pages.projectReports.sections.schedule'),
    engineering: t('pages.projectReports.sections.engineering'),
    moduleSummary: t('pages.projectReports.sections.moduleSummary'),
    tasksByStatus: t('pages.projectReports.breakdown.tasksByStatus'),
    packagesByStatus: t('pages.projectReports.breakdown.packagesByStatus'),
    disciplinesByStatus: t('pages.projectReports.breakdown.disciplinesByStatus'),
    metric: t('pages.systemReports.table.metric'),
    value: t('pages.systemReports.table.value'),
    count: t('pages.systemReports.table.count'),
    share: t('pages.systemReports.table.share'),
    module: t('pages.projectReports.table.module'),
    snapshot: t('pages.projectReports.table.snapshot'),
    footer: t('pages.projectReports.pdfFooter'),
    openRfis: t('pages.projectReports.metrics.openRfis'),
    overdueRfis: t('pages.projectReports.metrics.overdueRfis'),
    openIssues: t('pages.projectReports.metrics.openIssues'),
    openPunch: t('pages.projectReports.metrics.openPunch'),
    plannedProgress: t('pages.projectReports.metrics.plannedProgress'),
    actualProgress: t('pages.projectReports.metrics.actualProgress'),
    scheduleVariance: t('pages.projectReports.metrics.scheduleVariance'),
    taskCount: t('pages.projectReports.metrics.taskCount'),
    criticalTasks: t('pages.projectReports.metrics.criticalTasks'),
    activeReviews: t('pages.projectReports.metrics.activeReviews'),
    slaOverdue: t('pages.projectReports.metrics.slaOverdue'),
    openComments: t('pages.projectReports.metrics.openComments'),
    pendingSubmittals: t('pages.projectReports.metrics.pendingSubmittals'),
  };
}

function formatPdfCount(value: number | null | undefined): string {
  if (value == null) {
    return '-';
  }
  return String(value);
}

export default function ProjectReportsPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const authUser = useAuthStore((state) => state.user);
  const [exportingPdf, setExportingPdf] = useState(false);
  const projectQuery = useProject(projectId);
  const statsQuery = useProjectDashboardStats(projectId);
  const boardQuery = useProjectStatusBoard(projectId);
  const tasksQuery = useAllTasks(projectId);
  const { byTaskId: subtasksByTaskId } = useScheduleSubtasks(projectId);

  const statsApiUnavailable =
    statsQuery.isError &&
    statsQuery.error instanceof ApiRequestError &&
    (statsQuery.error.status === 404 || statsQuery.error.status === 0);

  const boardApiUnavailable =
    boardQuery.isError &&
    boardQuery.error instanceof ApiRequestError &&
    (boardQuery.error.status === 404 || boardQuery.error.status === 0);

  const isLoading =
    projectQuery.isLoading ||
    statsQuery.isLoading ||
    boardQuery.isLoading ||
    tasksQuery.isLoading;

  const project = projectQuery.data;
  const stats = statsQuery.data;
  const board = boardQuery.data;
  const tasks = tasksQuery.data?.data ?? [];

  const hasStats = stats != null;
  const scheduleFromTasks = useMemo(
    (): ScheduleMetrics => computeScheduleMetrics(tasks, subtasksByTaskId),
    [tasks, subtasksByTaskId],
  );

  const plannedProgressPct =
    stats?.plannedProgressPct ?? scheduleFromTasks.plannedProgressPct;
  const actualProgressPct =
    stats?.actualProgressPct ?? scheduleFromTasks.actualProgressPct;
  const scheduleVariancePct =
    stats?.scheduleVariancePct ?? scheduleFromTasks.scheduleVariancePct;

  const taskStatusChart = useMemo(() => countTasksByStatus(tasks), [tasks]);

  const siteOpsChart = useMemo((): ChartDatum[] => {
    if (!hasStats) {
      return [];
    }
    return [
      {
        name: t('pages.projectReports.metrics.openRfis'),
        value: stats.openRfis,
        color: tokens.colorTeal600,
      },
      {
        name: t('pages.projectReports.metrics.overdueRfis'),
        value: stats.overdueRfis,
        color: tokens.colorAmber400,
      },
      {
        name: t('pages.projectReports.metrics.openIssues'),
        value: stats.openIssues,
        color: tokens.colorRed600,
      },
      {
        name: t('pages.projectReports.metrics.openPunch'),
        value: stats.openPunchItems,
        color: tokens.colorBlue400,
      },
    ];
  }, [hasStats, stats, t]);

  const packagesChart = useMemo(
    () =>
      recordCountsToChart(
        board?.packagesByStatus ?? {},
        formatProjectedStatus,
      ),
    [board?.packagesByStatus],
  );

  const disciplinesChart = useMemo(
    () =>
      recordCountsToChart(
        board?.disciplinesByStatus ?? {},
        formatProjectedStatus,
      ),
    [board?.disciplinesByStatus],
  );

  const moduleSummary = useMemo((): ModuleSummaryRow[] => {
    const rows: ModuleSummaryRow[] = [
      {
        key: 'rfis',
        module: t('workspace.items.rfis'),
        metric: hasStats
          ? `${stats.openRfis} open · ${stats.overdueRfis} overdue`
          : '-',
        href: projectNavHref(projectId, 'rfis'),
      },
      {
        key: 'issues',
        module: t('workspace.items.issues'),
        metric: hasStats ? `${stats.openIssues} open` : '-',
        href: projectNavHref(projectId, 'issues'),
      },
      {
        key: 'punch',
        module: t('workspace.items.punchList'),
        metric: hasStats ? `${stats.openPunchItems} open` : '-',
        href: projectNavHref(projectId, 'punch-list'),
      },
      {
        key: 'schedule',
        module: t('workspace.items.schedule'),
        metric:
          tasks.length > 0
            ? `${scheduleFromTasks.taskCount} tasks · ${scheduleFromTasks.criticalCount} critical`
            : '-',
        href: projectNavHref(projectId, 'schedule'),
      },
    ];

    if (board && !boardApiUnavailable) {
      rows.push(
        {
          key: 'reviews',
          module: t('workspace.items.reviewInbox'),
          metric: `${board.activeReviewSessions} active · ${board.slaOverdueSessions} SLA overdue`,
          href: projectNavHref(projectId, 'review-inbox'),
        },
        {
          key: 'submittals',
          module: t('workspace.items.submittals'),
          metric: `${board.pendingSubmittals} pending`,
          href: projectNavHref(projectId, 'submittals'),
        },
      );
    }

    return rows;
  }, [
    board,
    boardApiUnavailable,
    hasStats,
    projectId,
    scheduleFromTasks.criticalCount,
    scheduleFromTasks.taskCount,
    stats,
    t,
    tasks.length,
  ]);

  const handleExportPdf = useCallback((): void => {
    if (!project) return;
    setExportingPdf(true);
    openProjectReportPdf(project.id)
      .then(() => { messageApi.success(t('pages.projectReports.exportSuccess')); })
      .catch(() => { messageApi.error(t('pages.projectReports.exportError')); })
      .finally(() => { setExportingPdf(false); });
  }, [project, messageApi, t]);

  if (isLoading) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div className={`project-reports-page ${layout.pageStack}`}>
      <FormLayout
        title={t('pages.projectReports.title')}
        description={t('pages.projectReports.description')}
        extra={
          <Button
            type="primary"
            icon={<FilePdfOutlined />}
            loading={exportingPdf}
            onClick={handleExportPdf}
          >
            {t('pages.projectReports.exportPdf')}
          </Button>
        }
      >
        {(statsApiUnavailable || boardApiUnavailable) && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title={t('pages.projectReports.partialDataTitle')}
            description={t('pages.projectReports.partialDataDescription')}
          />
        )}

        {project && (
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
                {t('pages.projectReports.projectCode')}
              </p>
              <p
                className="mt-1 font-[family-name:var(--font-mono)] text-[13px]"
                style={{ color: tokens.colorTextPrimary }}
              >
                {project.projectCode}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p
                className="text-[10px] font-medium uppercase tracking-[0.06em]"
                style={{ color: tokens.colorTextTertiary }}
              >
                {t('pages.projectReports.projectName')}
              </p>
              <p
                className="mt-1 text-[13px] font-medium"
                style={{ color: tokens.colorTextPrimary }}
              >
                {project.name}
              </p>
            </div>
            <div>
              <p
                className="text-[10px] font-medium uppercase tracking-[0.06em]"
                style={{ color: tokens.colorTextTertiary }}
              >
                {t('pages.projectReports.status')}
              </p>
              <div className="mt-1">
                <StatusBadge
                  label={formatProjectStatus(project.status)}
                  variant={projectStatusVariant(project.status)}
                />
              </div>
            </div>
            <div>
              <p
                className="text-[10px] font-medium uppercase tracking-[0.06em]"
                style={{ color: tokens.colorTextTertiary }}
              >
                {t('pages.projectReports.plannedFinish')}
              </p>
              <p className="mt-1 text-[13px]" style={{ color: tokens.colorTextPrimary }}>
                {formatProjectDate(project.plannedFinishDate)}
              </p>
            </div>
            <div>
              <p
                className="text-[10px] font-medium uppercase tracking-[0.06em]"
                style={{ color: tokens.colorTextTertiary }}
              >
                {t('pages.projectReports.budget')}
              </p>
              <p className="mt-1 text-[13px] tabular-nums" style={{ color: tokens.colorTextPrimary }}>
                {formatProjectBudget(project.budget, project.currency)}
              </p>
            </div>
            <div>
              <p
                className="text-[10px] font-medium uppercase tracking-[0.06em]"
                style={{ color: tokens.colorTextTertiary }}
              >
                {t('pages.projectReports.overallProgress')}
              </p>
              <p className="mt-1 text-[13px] tabular-nums" style={{ color: tokens.colorTextPrimary }}>
                {project.overallProgressPct != null
                  ? `${project.overallProgressPct}%`
                  : '-'}
              </p>
            </div>
            <div>
              <p
                className="text-[10px] font-medium uppercase tracking-[0.06em]"
                style={{ color: tokens.colorTextTertiary }}
              >
                {t('pages.projectReports.generatedAt')}
              </p>
              <p className="mt-1 text-[13px]" style={{ color: tokens.colorTextPrimary }}>
                {formatDisplayDateTime(new Date())}
              </p>
            </div>
          </div>
        )}

        <p
          className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: tokens.colorTextTertiary }}
        >
          {t('pages.projectReports.sections.siteOps')}
        </p>
        <Row gutter={[12, 12]} className="!mb-4">
          <Col xs={12} lg={6}>
            <KPICard
              label={t('pages.projectReports.metrics.openRfis')}
              value={formatCount(stats?.openRfis, hasStats)}
              icon={getNavIconComponent('rfis')}
              iconBg={tokens.colorTeal50}
              iconColor={tokens.colorTeal600}
            />
          </Col>
          <Col xs={12} lg={6}>
            <KPICard
              label={t('pages.projectReports.metrics.overdueRfis')}
              value={formatCount(stats?.overdueRfis, hasStats)}
              icon={CalendarOutlined}
              iconBg={tokens.colorAmber50}
              iconColor={tokens.colorAmber400}
            />
          </Col>
          <Col xs={12} lg={6}>
            <KPICard
              label={t('pages.projectReports.metrics.openIssues')}
              value={formatCount(stats?.openIssues, hasStats)}
              icon={getNavIconComponent('issues')}
              iconBg={tokens.colorRed50}
              iconColor={tokens.colorRed600}
            />
          </Col>
          <Col xs={12} lg={6}>
            <KPICard
              label={t('pages.projectReports.metrics.openPunch')}
              value={formatCount(stats?.openPunchItems, hasStats)}
              icon={getNavIconComponent('punch-list')}
              iconBg={tokens.colorBlue50}
              iconColor={tokens.colorBlue400}
            />
          </Col>
        </Row>

        <p
          className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: tokens.colorTextTertiary }}
        >
          {t('pages.projectReports.sections.schedule')}
        </p>
        <Row gutter={[12, 12]} className="!mb-4">
          <Col xs={12} lg={8}>
            <KPICard
              label={t('pages.projectReports.metrics.plannedProgress')}
              value={formatPercent(plannedProgressPct)}
              icon={getNavIconComponent('schedule')}
              iconBg={tokens.colorTeal50}
              iconColor={tokens.colorTeal600}
            />
          </Col>
          <Col xs={12} lg={8}>
            <KPICard
              label={t('pages.projectReports.metrics.actualProgress')}
              value={formatPercent(actualProgressPct)}
              icon={getNavIconComponent('schedule')}
              iconBg={tokens.colorGreen50}
              iconColor={tokens.colorGreen600}
            />
          </Col>
          <Col xs={12} lg={8}>
            <KPICard
              label={t('pages.projectReports.metrics.scheduleVariance')}
              value={formatPercent(scheduleVariancePct)}
              icon={CalendarOutlined}
              iconBg={tokens.colorAmber50}
              iconColor={tokens.colorAmber400}
            />
          </Col>
        </Row>

        {!boardApiUnavailable && board && (
          <>
            <p
              className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em]"
              style={{ color: tokens.colorTextTertiary }}
            >
              {t('pages.projectReports.sections.engineering')}
            </p>
            <Row gutter={[12, 12]} className="!mb-4">
              <Col xs={12} lg={6}>
                <KPICard
                  label={t('pages.projectReports.metrics.activeReviews')}
                  value={String(board.activeReviewSessions)}
                  icon={getNavIconComponent('review-inbox')}
                  iconBg={tokens.colorBlue50}
                  iconColor={tokens.colorBlue400}
                />
              </Col>
              <Col xs={12} lg={6}>
                <KPICard
                  label={t('pages.projectReports.metrics.slaOverdue')}
                  value={String(board.slaOverdueSessions)}
                  icon={CalendarOutlined}
                  iconBg={tokens.colorAmber50}
                  iconColor={tokens.colorAmber400}
                />
              </Col>
              <Col xs={12} lg={6}>
                <KPICard
                  label={t('pages.projectReports.metrics.openComments')}
                  value={String(board.openComments)}
                  icon={getNavIconComponent('my-comments')}
                  iconBg={tokens.colorTeal50}
                  iconColor={tokens.colorTeal600}
                />
              </Col>
              <Col xs={12} lg={6}>
                <KPICard
                  label={t('pages.projectReports.metrics.pendingSubmittals')}
                  value={String(board.pendingSubmittals)}
                  icon={getNavIconComponent('submittals')}
                  iconBg={tokens.colorGreen50}
                  iconColor={tokens.colorGreen600}
                />
              </Col>
            </Row>
          </>
        )}

        <p
          className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: tokens.colorTextTertiary }}
        >
          {t('pages.projectReports.sections.charts')}
        </p>
        <div className={`${layout.cardGrid} mb-4 lg:grid-cols-2`}>
          <ChartCard
            title={t('pages.projectReports.charts.tasksByStatus')}
            subtitle={t('pages.projectReports.charts.tasksByStatusHint')}
          >
            <TaskStatusDonutChart data={taskStatusChart} />
          </ChartCard>
          <ChartCard
            title={t('pages.projectReports.charts.siteOps')}
            subtitle={t('pages.projectReports.charts.siteOpsHint')}
          >
            <SiteOpsHorizontalChart data={siteOpsChart} />
          </ChartCard>
          {!boardApiUnavailable && (
            <>
              <ChartCard
                title={t('pages.projectReports.charts.packagesByStatus')}
                subtitle={t('pages.projectReports.charts.packagesByStatusHint')}
              >
                <PackagePieChart data={packagesChart} />
              </ChartCard>
              <ChartCard
                title={t('pages.projectReports.charts.disciplinesByStatus')}
                subtitle={t('pages.projectReports.charts.disciplinesByStatusHint')}
              >
                <DisciplineRadarChart data={disciplinesChart} />
              </ChartCard>
            </>
          )}
        </div>

        <p
          className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: tokens.colorTextTertiary }}
        >
          {t('pages.projectReports.sections.moduleSummary')}
        </p>
        <div className="erp-table-scroll min-w-0 w-full overflow-x-auto">
          <Table<ModuleSummaryRow>
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            dataSource={moduleSummary}
            columns={[
              {
                title: t('pages.projectReports.table.module'),
                dataIndex: 'module',
                key: 'module',
              },
              {
                title: t('pages.projectReports.table.snapshot'),
                dataIndex: 'metric',
                key: 'metric',
              },
              {
                title: '',
                key: 'action',
                width: 100,
                render: (_value, record) => (
                  <Link
                    href={record.href}
                    className="text-[12px] no-underline hover:underline"
                    style={{ color: tokens.colorTeal600 }}
                  >
                    {t('pages.projectReports.table.view')}
                  </Link>
                ),
              },
            ]}
          />
        </div>
      </FormLayout>
    </div>
  );
}
