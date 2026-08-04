'use client';

import Link from 'next/link';
import { Spin } from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { ArrowRight } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useCanManageUsers } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { LeaveRequestListItem } from '@/lib/api/leave.types';
import { useLeaveRequests } from '@/lib/query/leave';
import { layout } from '@/lib/theme/layout';
import {
  formatLeaveEmployeeName,
  formatLeaveStatus,
  formatLeaveType,
  leaveStatusVariant,
} from '@/lib/utils/leave-display';
import { formatProjectDate } from '@/lib/utils/project-display';

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

type QuickLink = {
  key: string;
  labelKey: string;
  href: string;
  descriptionKey: string;
};

const HR_QUICK_LINKS: readonly QuickLink[] = [
  {
    key: 'leave',
    labelKey: 'nav.hr.leaveRequests',
    href: '/hr/leave-requests',
    descriptionKey: 'pages.dashboard.hr.links.leave',
  },
  {
    key: 'overtime',
    labelKey: 'nav.hr.overtime',
    href: '/hr/overtime',
    descriptionKey: 'pages.dashboard.hr.links.overtime',
  },
  {
    key: 'expense',
    labelKey: 'nav.hr.expenseClaims',
    href: '/hr/expense-claims',
    descriptionKey: 'pages.dashboard.hr.links.expense',
  },
  {
    key: 'users',
    labelKey: 'nav.users',
    href: '/users',
    descriptionKey: 'pages.dashboard.hr.links.users',
  },
  {
    key: 'approvals',
    labelKey: 'nav.approvals',
    href: '/approvals',
    descriptionKey: 'pages.dashboard.hr.links.approvals',
  },
] as const;

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}): React.ReactNode {
  return (
    <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] m-0">
          {title}
        </h3>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function RecentLeaveList({
  items,
}: {
  items: LeaveRequestListItem[];
}): React.ReactNode {
  const { t } = useEpcTranslation();

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-tertiary)] m-0">
        {t('pages.dashboard.hr.noRecentLeave')}
      </p>
    );
  }

  return (
    <ul className="m-0 list-none p-0 divide-y divide-[rgba(0,0,0,0.06)]">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/hr/leave-requests/${item.id}`}
            className="flex gap-3 py-3 first:pt-0 last:pb-0 hover:opacity-90"
          >
            <div className="w-[72px] shrink-0 text-xs text-[var(--color-text-tertiary)] pt-0.5">
              {item.submittedAt
                ? dayjs(item.submittedAt).fromNow()
                : dayjs(item.createdAt).fromNow()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--color-text-primary)] m-0">
                {formatLeaveEmployeeName(item.employee)} ·{' '}
                {formatLeaveType(item.leaveType)}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)] m-0 mt-0.5">
                {item.requestNumber} · {formatProjectDate(item.startDate)} –{' '}
                {formatProjectDate(item.endDate)} ({item.days}d)
              </p>
            </div>
            <StatusBadge
              label={formatLeaveStatus(item.status)}
              variant={leaveStatusVariant(item.status)}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * HR home dashboard — leave KPIs, recent requests, and HR module shortcuts.
 */
export default function HrDashboard({
  enabled = true,
}: {
  enabled?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const canManageUsers = useCanManageUsers();

  const pendingQuery = useLeaveRequests(
    {
      page: 1,
      limit: 1,
      status: ['SUBMITTED', 'IN_REVIEW'],
    },
    enabled,
  );
  const approvedQuery = useLeaveRequests(
    {
      page: 1,
      limit: 1,
      status: ['APPROVED'],
    },
    enabled,
  );
  const recentQuery = useLeaveRequests(
    {
      page: 1,
      limit: 8,
    },
    enabled,
  );

  const loading =
    (pendingQuery.isLoading ||
      approvedQuery.isLoading ||
      recentQuery.isLoading) &&
    !pendingQuery.data &&
    !approvedQuery.data;

  if (loading) {
    return (
      <div className={layout.loadingCard}>
        <Spin />
      </div>
    );
  }

  const pendingCount = pendingQuery.data?.meta.total ?? 0;
  const approvedCount = approvedQuery.data?.meta.total ?? 0;
  const recentItems = recentQuery.data?.data ?? [];

  const cards: KpiCardConfig[] = [
    {
      key: 'pending',
      label: t('pages.dashboard.hr.kpi.pendingLeave'),
      value: pendingCount.toLocaleString(),
      subtext: t('pages.dashboard.hr.kpi.pendingLeaveHint'),
      link: '/hr/leave-requests',
      icon: ClockCircleOutlined,
    },
    {
      key: 'approved',
      label: t('pages.dashboard.hr.kpi.approvedLeave'),
      value: approvedCount.toLocaleString(),
      subtext: t('pages.dashboard.hr.kpi.approvedLeaveHint'),
      link: '/hr/leave-requests',
      icon: CheckCircleOutlined,
    },
    {
      key: 'leave',
      label: t('pages.dashboard.hr.kpi.leaveModule'),
      value: t('pages.dashboard.hr.kpi.open'),
      subtext: t('pages.dashboard.hr.kpi.leaveModuleHint'),
      link: '/hr/leave-requests',
      icon: CalendarOutlined,
    },
  ];

  if (canManageUsers) {
    cards.push({
      key: 'users',
      label: t('pages.dashboard.hr.kpi.users'),
      value: t('pages.dashboard.hr.kpi.open'),
      subtext: t('pages.dashboard.hr.kpi.usersHint'),
      link: '/users',
      icon: TeamOutlined,
    });
  }

  const quickLinks = HR_QUICK_LINKS.filter(
    (link) => link.key !== 'users' || canManageUsers,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.key} href={card.link} className="block group">
              <div className="h-full bg-white rounded-lg border border-[rgba(0,0,0,0.08)] px-4 py-3 transition-colors group-hover:border-[rgba(0,0,0,0.14)]">
                <div className="mb-2 flex items-center gap-2">
                  <Icon className="text-[var(--color-text-tertiary)]" />
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
                    {card.label}
                  </span>
                </div>
                <p className="m-0 text-2xl font-semibold text-[var(--color-text-primary)] leading-tight">
                  {card.value}
                </p>
                <p className="m-0 mt-1 text-xs text-[var(--color-text-tertiary)]">
                  {card.subtext}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={t('pages.dashboard.hr.recentLeave')}
          action={
            <Link
              href="/hr/leave-requests"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-teal-600)] no-underline hover:underline"
            >
              {t('pages.dashboard.hr.viewAllLeave')}
              <ArrowRight size={12} />
            </Link>
          }
        >
          <RecentLeaveList items={recentItems} />
        </SectionCard>

        <SectionCard title={t('pages.dashboard.hr.quickLinks')}>
          <ul className="m-0 list-none p-0 divide-y divide-[rgba(0,0,0,0.06)]">
            {quickLinks.map((link) => (
              <li key={link.key}>
                <Link
                  href={link.href}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 no-underline group"
                >
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-medium text-[var(--color-text-primary)]">
                      {t(link.labelKey)}
                    </p>
                    <p className="m-0 mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                      {t(link.descriptionKey)}
                    </p>
                  </div>
                  <ArrowRight
                    size={14}
                    className="shrink-0 text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-primary)]"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
