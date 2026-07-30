'use client';

import Link from 'next/link';
import { Spin } from 'antd';
import {
  AuditOutlined,
  CheckSquareOutlined,
  ExclamationCircleOutlined,
  QuestionCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ComponentType, ReactNode } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { MyDashboardActivityItem } from '@/lib/api/reporting.types';
import { useMyDashboard } from '@/lib/query/dashboard';
import { layout } from '@/lib/theme/layout';

dayjs.extend(relativeTime);

type IconComponent = ComponentType<{ className?: string }>;

type KpiCardConfig = {
  key: string;
  label: string;
  value: string;
  subtext: string;
  link: string;
  icon: IconComponent;
};

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): React.ReactNode {
  return (
    <div className={`${layout.cardSurface} ${layout.cardPadding}`}>
      <h3 className="mb-3 text-sm font-medium text-[var(--color-text-primary)]">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ActivityFeed({
  items,
}: {
  items: MyDashboardActivityItem[];
}): React.ReactNode {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-tertiary)]">
        No recent activity.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <Link
          key={`${item.type}-${item.date}-${item.title}`}
          href={item.link}
          className="flex gap-3 border-b border-[var(--color-border-tertiary)] py-2 last:border-b-0 hover:bg-[var(--color-surface-secondary)]"
        >
          <div className="w-[80px] shrink-0 text-xs text-[var(--color-text-tertiary)]">
            {dayjs(item.date).fromNow()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-[var(--color-text-primary)]">
              {item.title}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {item.type}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

/**
 * Personal dashboard for FK-scoped roles (Designer, Discipline Lead, Reviewer).
 */
export default function PersonalDashboard({
  enabled = true,
}: {
  enabled?: boolean;
}): React.ReactNode {
  const myQuery = useMyDashboard(enabled);
  const stats = myQuery.data;
  const loading = myQuery.isLoading || myQuery.isFetching;

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
        <p className="text-sm text-[var(--color-text-tertiary)]">
          Unable to load personal dashboard.
        </p>
      </div>
    );
  }

  const cards: KpiCardConfig[] = [
    {
      key: 'subtasks',
      label: 'My Subtasks',
      value: stats.mySubtasks.toLocaleString(),
      subtext: 'assigned to me',
      link: '/my-work',
      icon: CheckSquareOutlined,
    },
    {
      key: 'reviews',
      label: 'Pending Reviews',
      value: stats.myActiveReviews.toLocaleString(),
      subtext: 'awaiting my action',
      link: '/review-inbox',
      icon: AuditOutlined,
    },
    {
      key: 'issues',
      label: 'My Issues',
      value: stats.myOpenIssues.toLocaleString(),
      subtext: 'open assignments',
      link: '/issues',
      icon: ExclamationCircleOutlined,
    },
    {
      key: 'rfis',
      label: 'My RFIs',
      value: stats.myOpenRfis.toLocaleString(),
      subtext: 'open assignments',
      link: '/rfis',
      icon: QuestionCircleOutlined,
    },
  ];

  return (
    <div className={layout.sectionStack}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.key} href={card.link} className="block">
              <div className="cursor-pointer rounded-lg border border-[var(--color-border-tertiary)] p-4 transition-shadow hover:shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Icon className="text-[var(--color-text-secondary)]" />
                  <span className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    {card.label}
                  </span>
                </div>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                  {card.value}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  {card.subtext}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="My Action Items">
          <Link
            href="/meetings"
            className="flex items-center justify-between rounded-lg border border-[var(--color-border-tertiary)] px-3 py-3 hover:bg-[var(--color-surface-secondary)]"
          >
            <div>
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                {stats.myOpenActionItems.toLocaleString()}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                open action items assigned to me
              </p>
            </div>
            <span className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
              View meetings
            </span>
          </Link>
          {stats.myPendingDailyLogs > 0 ? (
            <Link
              href="/daily-logs"
              className="mt-2 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              <span>
                {stats.myPendingDailyLogs.toLocaleString()} pending daily logs
              </span>
              <span className="text-xs uppercase tracking-wide">View</span>
            </Link>
          ) : null}
        </SectionCard>

        <SectionCard title="My Risks">
          <Link
            href="/risks"
            className="flex items-center justify-between rounded-lg border border-[var(--color-border-tertiary)] px-3 py-3 hover:bg-[var(--color-surface-secondary)]"
          >
            <div className="flex items-center gap-3">
              <WarningOutlined className="text-[var(--color-text-secondary)]" />
              <div>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                  {stats.myRisks.toLocaleString()}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  risks I own
                </p>
              </div>
            </div>
            <span className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
              View risks
            </span>
          </Link>
        </SectionCard>
      </div>

      <SectionCard title="Recent Activity">
        <ActivityFeed items={stats.recentActivity} />
      </SectionCard>
    </div>
  );
}
