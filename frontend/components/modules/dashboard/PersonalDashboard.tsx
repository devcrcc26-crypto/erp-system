'use client';

import { Spin } from 'antd';
import {
  SectionCard,
  StatCard,
} from '@/components/modules/dashboard/DashboardStats';
import { useMyDashboard } from '@/lib/query/dashboard';
import { formatRelativeTime } from '@/lib/utils/date-format';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Personal dashboard for FK-scoped roles (Designer, Discipline Lead, Reviewer).
 */
export default function PersonalDashboard({
  enabled = true,
}: {
  enabled?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const myQuery = useMyDashboard(enabled);
  const my = myQuery.data;
  const loading = myQuery.isLoading || myQuery.isFetching;

  if (loading && !my) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-dashboard-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  if (!my) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-dashboard-page">
        <div className="erp-pro-card p-6">
          <p className="erp-users-cell-sub m-0">
            {t('pages.dashboard.personal.loadFailed')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-dashboard-page">
      <div className="erp-users-stat-bar erp-dashboard-stat-bar--4">
        <StatCard
          label={t('pages.dashboard.personal.myTasks')}
          value={my.mySubtasks}
          color="teal"
          href="/my-work"
        />
        <StatCard
          label={t('pages.dashboard.personal.activeReviews')}
          value={my.myActiveReviews}
          color="blue"
          href="/review-inbox"
        />
        <StatCard
          label={t('pages.dashboard.personal.openIssues')}
          value={my.myOpenIssues}
          color={my.myOpenIssues > 0 ? 'red' : 'default'}
          href="/issues"
        />
        <StatCard
          label={t('pages.dashboard.personal.openRfis')}
          value={my.myOpenRfis}
          color={my.myOpenRfis > 0 ? 'amber' : 'default'}
          href="/rfis"
        />
      </div>

      <SectionCard title={t('pages.dashboard.personal.recentActivity')}>
        {my.recentActivity.length === 0 ? (
          <p className="erp-users-cell-sub m-0">
            {t('pages.dashboard.personal.noActivity')}
          </p>
        ) : (
          <div className="flex flex-col">
            {my.recentActivity.map((item, index) => (
              <a
                key={`${item.type}-${item.date}-${index}`}
                href={item.link}
                className="flex items-start gap-3 border-b border-[#eef1f4] py-2.5 no-underline last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="erp-users-cell-strong m-0">{item.title}</p>
                  <p className="erp-users-cell-sub m-0 mt-0.5">
                    {formatRelativeTime(item.date)}
                  </p>
                </div>
                <span className="flex-shrink-0 text-xs font-medium text-[#1D9E75]">
                  {t('common.view')} →
                </span>
              </a>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
