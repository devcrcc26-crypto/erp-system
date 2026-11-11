// UI polish pass - styles only, no logic changes

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button } from 'antd';
import { CalendarOutlined, BranchesOutlined, FileExcelOutlined, InboxOutlined } from '@ant-design/icons';
import { getNavIcon, getNavIconComponent, navIconClassName } from '@/lib/navigation/nav-icons';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import KPICard from '@/components/ui/KPICard/KPICard';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { ApiRequestError } from '@/lib/api/errors';
import { useProjectDashboardStats } from '@/lib/query/projects';
import { useAllTasks, useScheduleSubtasks } from '@/lib/query/schedule';
import { useChangeRequests } from '@/lib/query/change-requests';
import { useDeliverables } from '@/lib/query/deliverables';
import { computeScheduleMetrics } from '@/lib/utils/schedule-metrics';
import ProjectStatusBoard from '@/components/modules/projects/workspaces/ProjectStatusBoard';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  downloadTaskListExcel,
  downloadTaskListSummaryExcel,
} from '@/lib/query/project-exports';

const QUICK_LINKS = [
  {
    href: 'disciplines',
    navIconKey: 'disciplines',
    label: 'Disciplines & Subtasks',
    description: 'Engineering subtasks and documents',
  },
  {
    href: 'overview/status',
    navIconKey: 'status-board',
    label: 'Status Board',
    description: 'EPC workflow KPIs and bottlenecks',
  },
  {
    href: 'submittals',
    navIconKey: 'submittals',
    label: 'Submittals',
    description: 'Design issue and release subtasks',
  },
  {
    href: 'schedule',
    navIconKey: 'schedule',
    label: 'Schedule',
    description: 'Milestones, tasks, and Gantt',
  },
  {
    href: 'overview/reports',
    navIconKey: 'reports',
    label: 'Reports',
    description: 'KPIs, charts, and module snapshots',
  },
] as const;

function formatCount(value: number | undefined, hasStats: boolean): string {
  if (hasStats && value != null) {
    return String(value);
  }
  return '-';
}

export default function ProjectDashboard({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [exportingTasks, setExportingTasks] = useState(false);
  const [exportingTasksSummary, setExportingTasksSummary] = useState(false);
  const statsQuery = useProjectDashboardStats(projectId);

  const statsApiUnavailable =
    statsQuery.isError &&
    statsQuery.error instanceof ApiRequestError &&
    (statsQuery.error.status === 404 || statsQuery.error.status === 0);

  const tasksQuery = useAllTasks(projectId, statsApiUnavailable);
  const { byTaskId: subtasksByTaskId } = useScheduleSubtasks(
    projectId,
    statsApiUnavailable,
  );

  const changeRequestsQuery = useChangeRequests(
    projectId,
    { page: 1, limit: 100, sortBy: 'createdAt', sortOrder: 'desc' },
    !statsApiUnavailable,
  );
  const deliverablesQuery = useDeliverables(
    projectId,
    { page: 1, limit: 100, sortBy: 'createdAt', sortOrder: 'desc' },
    !statsApiUnavailable,
  );

  const openChangeRequests =
    changeRequestsQuery.data?.data.filter((cr) => cr.status === 'SUBMITTED')
      .length ?? 0;
  const approvedChangeRequestsThisMonth =
    changeRequestsQuery.data?.data.filter((cr) => {
      if (cr.status !== 'APPROVED' || !cr.approvedAt) return false;
      const d = new Date(cr.approvedAt);
      const now = new Date();
      return (
        d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      );
    }).length ?? 0;
  const activeDeliverables =
    deliverablesQuery.data?.data.filter(
      (d) => d.status === 'IN_PROGRESS' || d.status === 'SUBMITTED',
    ).length ?? 0;
  const approvedDeliverablesThisMonth =
    deliverablesQuery.data?.data.filter((d) => {
      if (d.status !== 'APPROVED') return false;
      const updated = new Date(d.updatedAt);
      const now = new Date();
      return (
        updated.getMonth() === now.getMonth() &&
        updated.getFullYear() === now.getFullYear()
      );
    }).length ?? 0;

  if (statsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  const stats = statsQuery.data;
  const hasStats = stats != null;
  const scheduleFallback =
    statsApiUnavailable && tasksQuery.data?.data
      ? computeScheduleMetrics(tasksQuery.data.data, subtasksByTaskId)
      : null;

  const plannedProgressPct =
    stats?.plannedProgressPct ?? scheduleFallback?.plannedProgressPct ?? null;
  const actualProgressPct =
    stats?.actualProgressPct ?? scheduleFallback?.actualProgressPct ?? null;
  const scheduleVariancePct =
    stats?.scheduleVariancePct ?? scheduleFallback?.scheduleVariancePct ?? null;

  const scheduleLoading = statsApiUnavailable && tasksQuery.isLoading;

  async function handleExportTaskList(): Promise<void> {
    setExportingTasks(true);
    try {
      await downloadTaskListExcel(projectId);
      messageApi.success('Task list export downloaded.');
    } catch {
      messageApi.error('Unable to export task list. Please try again.');
    } finally {
      setExportingTasks(false);
    }
  }

  async function handleExportTaskListSummary(): Promise<void> {
    setExportingTasksSummary(true);
    try {
      await downloadTaskListSummaryExcel(projectId);
      messageApi.success('Task list summary export downloaded.');
    } catch {
      messageApi.error('Unable to export task list summary. Please try again.');
    } finally {
      setExportingTasksSummary(false);
    }
  }

  return (
    <div className={layout.pageStack}>
      {statsApiUnavailable && (
        <Alert
          type="info"
          showIcon
          title="Dashboard metrics will appear when the project management API is connected."
          description={
            scheduleFallback
              ? 'Schedule progress is estimated from task data until the dashboard endpoint is available.'
              : undefined
          }
        />
      )}

      <div className={`${layout.cardGrid} sm:grid-cols-2 xl:grid-cols-3`}>
        <KPICard
          label="Open RFIs"
          value={formatCount(stats?.openRfis, hasStats)}
          icon={getNavIconComponent('rfis')}
          iconBg={tokens.colorTeal50}
          iconColor={tokens.colorTeal600}
        />
        <KPICard
          label="Overdue RFIs"
          value={formatCount(stats?.overdueRfis, hasStats)}
          icon={CalendarOutlined}
          iconBg={tokens.colorAmber50}
          iconColor={tokens.colorAmber400}
        />
        <KPICard
          label="Open issues"
          value={formatCount(stats?.openIssues, hasStats)}
          icon={getNavIconComponent('issues')}
          iconBg={tokens.colorRed50}
          iconColor={tokens.colorRed600}
        />
        <KPICard
          label="Open punch items"
          value={formatCount(stats?.openPunchItems, hasStats)}
          icon={getNavIconComponent('team')}
          iconBg={tokens.colorBlue50}
          iconColor={tokens.colorBlue400}
        />
        <KPICard
          label="Open change requests"
          value={String(openChangeRequests)}
          extra={
            approvedChangeRequestsThisMonth > 0 ? (
              <span style={{ color: tokens.colorGreen600 }}>
                {approvedChangeRequestsThisMonth} approved this month
              </span>
            ) : undefined
          }
          icon={BranchesOutlined}
          iconBg={tokens.colorAmber50}
          iconColor={tokens.colorAmber400}
        />
        <KPICard
          label="Active deliverables"
          value={String(activeDeliverables)}
          extra={
            approvedDeliverablesThisMonth > 0 ? (
              <span style={{ color: tokens.colorGreen600 }}>
                {approvedDeliverablesThisMonth} approved this month
              </span>
            ) : undefined
          }
          icon={InboxOutlined}
          iconBg={tokens.colorBlue50}
          iconColor={tokens.colorBlue400}
        />
      </div>

      <FormLayout title={t('pages.epcSnapshot.title')}>
        <ProjectStatusBoard projectId={projectId} compact />
      </FormLayout>

      <div className={`${layout.cardGrid} lg:grid-cols-2`}>
        <FormLayout
          title="Schedule snapshot"
          extra={
            <div className="flex flex-wrap gap-2">
              <Button
                icon={<FileExcelOutlined />}
                loading={exportingTasksSummary}
                onClick={() => void handleExportTaskListSummary()}
              >
                Export task list (summary)
              </Button>
              <Button
                icon={<FileExcelOutlined />}
                loading={exportingTasks}
                onClick={() => void handleExportTaskList()}
              >
                Export task list
              </Button>
            </div>
          }
        >
          {scheduleLoading ? (
            <div className="space-y-3 py-2">
              <div className="erp-page-skeleton h-10 w-full rounded" />
              <div className="erp-page-skeleton h-10 w-full rounded" />
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt
                  className="text-[11px] font-normal"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  Planned progress
                </dt>
                <dd
                  className="text-[18px] font-medium tracking-[-0.02em]"
                  style={{ color: tokens.colorTextPrimary }}
                >
                  {plannedProgressPct != null ? `${plannedProgressPct}%` : '-'}
                </dd>
              </div>
              <div>
                <dt
                  className="text-[11px] font-normal"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  Actual progress
                </dt>
                <dd
                  className="text-[18px] font-medium tracking-[-0.02em]"
                  style={{ color: tokens.colorTextPrimary }}
                >
                  {actualProgressPct != null ? `${actualProgressPct}%` : '-'}
                </dd>
              </div>
              <div className="col-span-2">
                <dt
                  className="text-[11px] font-normal"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  Schedule variance
                </dt>
                <dd
                  className="text-[18px] font-medium tracking-[-0.02em]"
                  style={{ color: tokens.colorTextPrimary }}
                >
                  {scheduleVariancePct != null ? `${scheduleVariancePct}%` : '-'}
                </dd>
              </div>
            </dl>
          )}
        </FormLayout>

        <FormLayout title="Quick links">
          <ul className="space-y-2">
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={`/projects/${projectId}/${link.href}`}
                  className="flex items-start gap-3 rounded-lg px-4 py-3 no-underline transition-colors hover:bg-[var(--color-surface-secondary)]"
                  style={{ border: `0.5px solid ${tokens.colorBorder}` }}
                >
                  <span
                    className={navIconClassName}
                    style={{ color: tokens.colorTextSecondary }}
                  >
                    {getNavIcon(link.navIconKey)}
                  </span>
                  <div className="min-w-0">
                    <p
                      className="text-[12px] font-medium"
                      style={{ color: tokens.colorTextPrimary }}
                    >
                      {link.label}
                    </p>
                    <p
                      className="text-[10px] font-normal"
                      style={{ color: tokens.colorTextTertiary }}
                    >
                      {link.description}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </FormLayout>
      </div>
    </div>
  );
}
