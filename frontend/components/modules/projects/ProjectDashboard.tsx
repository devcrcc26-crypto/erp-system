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

export default function ProjectDashboard({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const statsQuery = useProjectDashboardStats(projectId);

  if (statsQuery.isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  const stats = statsQuery.data;
  const apiUnavailable =
    statsQuery.isError &&
    statsQuery.error instanceof ApiRequestError &&
    (statsQuery.error.status === 404 || statsQuery.error.status === 0);

  return (
    <div className="space-y-4">
      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          message="Dashboard metrics will appear when the project management API is connected."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label="Open RFIs"
          value={String(stats?.openRfis ?? 0)}
          icon={FileTextOutlined}
          iconBg="#ffedd5"
          iconColor="#c2410c"
        />
        <KPICard
          label="Overdue RFIs"
          value={String(stats?.overdueRfis ?? 0)}
          icon={CalendarOutlined}
          iconBg="#fef3c7"
          iconColor="#92400e"
        />
        <KPICard
          label="Open issues"
          value={String(stats?.openIssues ?? 0)}
          icon={IssuesCloseOutlined}
          iconBg="#fee2e2"
          iconColor="#dc2626"
        />
        <KPICard
          label="Open punch items"
          value={String(stats?.openPunchItems ?? 0)}
          icon={TeamOutlined}
          iconBg="#e0f2fe"
          iconColor="#0369a1"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FormLayout title="Schedule snapshot">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Planned progress</dt>
              <dd className="text-lg font-semibold text-slate-900">
                {stats?.plannedProgressPct != null
                  ? `${stats.plannedProgressPct}%`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Actual progress</dt>
              <dd className="text-lg font-semibold text-slate-900">
                {stats?.actualProgressPct != null
                  ? `${stats.actualProgressPct}%`
                  : '—'}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">Schedule variance</dt>
              <dd className="text-lg font-semibold text-slate-900">
                {stats?.scheduleVariancePct != null
                  ? `${stats.scheduleVariancePct}%`
                  : '—'}
              </dd>
            </div>
          </dl>
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
