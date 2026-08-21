'use client';

import { Spin } from 'antd';
import {
  SectionCard,
  StatCard,
} from '@/components/modules/dashboard/DashboardStats';
import { useMyDashboard } from '@/lib/query/dashboard';
import { layout } from '@/lib/theme/layout';
import { formatRelativeTime } from '@/lib/utils/date-format';

/**
 * Personal dashboard for FK-scoped roles (Designer, Discipline Lead, Reviewer).
 */
export default function PersonalDashboard({
  enabled = true,
}: {
  enabled?: boolean;
}): React.ReactNode {
  const myQuery = useMyDashboard(enabled);
  const my = myQuery.data;
  const loading = myQuery.isLoading || myQuery.isFetching;

  if (loading && !my) {
    return (
      <div className={layout.loadingCard}>
        <Spin />
      </div>
    );
  }

  if (!my) {
    return (
      <div className={`${layout.cardSurface} ${layout.cardPadding}`}>
        <p className="text-sm text-[var(--color-text-tertiary)] m-0">
          Unable to load personal dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="My Tasks"
          value={my.mySubtasks}
          color="teal"
          href="/my-work"
        />
        <StatCard
          label="Active Reviews"
          value={my.myActiveReviews}
          color="blue"
          href="/review-inbox"
        />
        <StatCard
          label="Open Issues"
          value={my.myOpenIssues}
          color={my.myOpenIssues > 0 ? 'red' : 'default'}
          href="/issues"
        />
        <StatCard
          label="Open RFIs"
          value={my.myOpenRfis}
          color={my.myOpenRfis > 0 ? 'amber' : 'default'}
          href="/rfis"
        />
      </div>

      <SectionCard title="Recent Activity">
        {my.recentActivity.length === 0 ? (
          <p className="text-sm text-[var(--color-text-tertiary)] m-0">
            No recent activity.
          </p>
        ) : (
          <div className="flex flex-col">
            {my.recentActivity.map((item, index) => (
              <a
                key={`${item.type}-${item.date}-${index}`}
                href={item.link}
                className="flex items-start gap-3 py-2.5 border-b border-[rgba(0,0,0,0.06)] last:border-0 no-underline"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--color-text-primary)] m-0">
                    {item.title}
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 m-0">
                    {formatRelativeTime(item.date)}
                  </p>
                </div>
                <span className="text-xs text-[#1D9E75] font-medium flex-shrink-0">
                  View →
                </span>
              </a>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
