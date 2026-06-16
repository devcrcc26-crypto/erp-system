'use client';

import Link from 'next/link';
import { Alert, Spin } from 'antd';
import {
  CalendarOutlined,
  FileTextOutlined,
  IssuesCloseOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import KPICard from '@/components/ui/KPICard/KPICard';
import { ApiRequestError } from '@/lib/api/errors';
import { useProjectDashboardStats } from '@/lib/query/projects';
import { useTasks } from '@/lib/query/schedule';
import { computeScheduleMetrics } from '@/lib/utils/schedule-metrics';

const QUICK_LINKS = [
  {
    href: 'rfis',
    label: 'RFIs',
    description: 'Requests for information',
  },
  {
    href: 'issues',
    label: 'Issues',
    description: 'Site issues and defects',
  },
  {
    href: 'schedule',
    label: 'Schedule',
    description: 'Milestones and Gantt',
  },
  {
    href: 'daily-logs',
    label: 'Daily Logs',
    description: 'Site diary entries',
  },
] as const;

function formatCount(value: number | undefined, hasStats: boolean): string {
  if (hasStats && value != null) {
    return String(value);
  }
  return '?';
}

export default function ProjectDashboard({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const statsQuery = useProjectDashboardStats(projectId);

  const statsApiUnavailable =
    statsQuery.isError &&
    statsQuery.error instanceof ApiRequestError &&
    (statsQuery.error.status === 404 || statsQuery.error.status === 0);

  const tasksQuery = useTasks(
    projectId,
    { page: 1, limit: 500 },
    statsApiUnavailable,
  );

  if (statsQuery.isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  const stats = statsQuery.data;
  const hasStats = stats != null;
  const scheduleFallback =
    statsApiUnavailable && tasksQuery.data?.data
      ? computeScheduleMetrics(tasksQuery.data.data)
      : null;

  const plannedProgressPct =
    stats?.plannedProgressPct ?? scheduleFallback?.plannedProgressPct ?? null;
  const actualProgressPct =
    stats?.actualProgressPct ?? scheduleFallback?.actualProgressPct ?? null;
  const scheduleVariancePct =
    stats?.scheduleVariancePct ?? scheduleFallback?.scheduleVariancePct ?? null;

  const scheduleLoading = statsApiUnavailable && tasksQuery.isLoading;

  return (
    <div className="space-y-4">
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label="Open RFIs"
          value={formatCount(stats?.openRfis, hasStats)}
          icon={FileTextOutlined}
          iconBg="#ffedd5"
          iconColor="#c2410c"
        />
        <KPICard
          label="Overdue RFIs"
          value={formatCount(stats?.overdueRfis, hasStats)}
          icon={CalendarOutlined}
          iconBg="#fef3c7"
          iconColor="#92400e"
        />
        <KPICard
          label="Open issues"
          value={formatCount(stats?.openIssues, hasStats)}
          icon={IssuesCloseOutlined}
          iconBg="#fee2e2"
          iconColor="#dc2626"
        />
        <KPICard
          label="Open punch items"
          value={formatCount(stats?.openPunchItems, hasStats)}
          icon={TeamOutlined}
          iconBg="#e0f2fe"
          iconColor="#0369a1"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FormLayout title="Schedule snapshot">
          {scheduleLoading ? (
            <div className="flex justify-center py-6">
              <Spin size="small" />
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-slate-500">Planned progress</dt>
                <dd className="text-lg font-semibold text-slate-900">
                  {plannedProgressPct != null ? `${plannedProgressPct}%` : '?'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Actual progress</dt>
                <dd className="text-lg font-semibold text-slate-900">
                  {actualProgressPct != null ? `${actualProgressPct}%` : '?'}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500">Schedule variance</dt>
                <dd className="text-lg font-semibold text-slate-900">
                  {scheduleVariancePct != null ? `${scheduleVariancePct}%` : '?'}
                </dd>
              </div>
            </dl>
          )}
        </FormLayout>

        <FormLayout title="Quick links">
          <ul className="space-y-3">
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={`/projects/${projectId}/${link.href}`}
                  className="block rounded-md border border-slate-200 px-4 py-3 transition-colors hover:border-orange-200 hover:bg-orange-50"
                >
                  <p className="font-medium text-slate-900">{link.label}</p>
                  <p className="text-sm text-slate-500">{link.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </FormLayout>
      </div>
    </div>
  );
}
