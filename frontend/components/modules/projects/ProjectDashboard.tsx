// UI polish pass — styles only, no logic changes

'use client';

import Link from 'next/link';
import { Alert } from 'antd';
import {
  CalendarOutlined,
} from '@ant-design/icons';
import { getNavIcon, getNavIconComponent, navIconClassName } from '@/lib/navigation/nav-icons';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import KPICard from '@/components/ui/KPICard/KPICard';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { ApiRequestError } from '@/lib/api/errors';
import { useProjectDashboardStats } from '@/lib/query/projects';
import { useAllTasks } from '@/lib/query/schedule';
import { computeScheduleMetrics } from '@/lib/utils/schedule-metrics';
import ProjectStatusBoard from '@/components/modules/projects/workspaces/ProjectStatusBoard';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

const QUICK_LINKS = [
  {
    href: 'disciplines',
    navIconKey: 'disciplines',
    label: 'Disciplines & Packages',
    description: 'Engineering design packages and documents',
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
    description: 'Design issue and release packages',
  },
  {
    href: 'schedule',
    navIconKey: 'schedule',
    label: 'Schedule',
    description: 'Milestones, tasks, and Gantt',
  },
] as const;

function formatCount(value: number | undefined, hasStats: boolean): string {
  if (hasStats && value != null) {
    return String(value);
  }
  return '—';
}

export default function ProjectDashboard({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const statsQuery = useProjectDashboardStats(projectId);

  const statsApiUnavailable =
    statsQuery.isError &&
    statsQuery.error instanceof ApiRequestError &&
    (statsQuery.error.status === 404 || statsQuery.error.status === 0);

  const tasksQuery = useAllTasks(projectId, statsApiUnavailable);

  if (statsQuery.isLoading) {
    return <PageLoadingSkeleton />;
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

      <div className={`${layout.cardGrid} sm:grid-cols-2 xl:grid-cols-4`}>
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
      </div>

      <FormLayout title={t('pages.epcSnapshot.title')}>
        <ProjectStatusBoard projectId={projectId} compact />
      </FormLayout>

      <div className={`${layout.cardGrid} lg:grid-cols-2`}>
        <FormLayout title="Schedule snapshot">
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
                  {plannedProgressPct != null ? `${plannedProgressPct}%` : '—'}
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
                  {actualProgressPct != null ? `${actualProgressPct}%` : '—'}
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
                  {scheduleVariancePct != null ? `${scheduleVariancePct}%` : '—'}
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
