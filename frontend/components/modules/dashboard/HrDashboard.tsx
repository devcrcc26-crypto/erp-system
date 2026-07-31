'use client';

import Link from 'next/link';
import { Spin } from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons';
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

function RecentLeaveList({
  items,
}: {
  items: LeaveRequestListItem[];
}): React.ReactNode {
  const { t } = useEpcTranslation();

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-tertiary)]">
        {t('pages.dashboard.hr.noRecentLeave')}
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/hr/leave-requests/${item.id}`}
          className="flex gap-3 border-b border-[var(--color-border-tertiary)] py-2.5 last:border-b-0 hover:bg-[var(--color-surface-secondary)]"
        >
          <div className="w-[72px] shrink-0 text-xs text-[var(--color-text-tertiary)]">
            {item.submittedAt
              ? dayjs(item.submittedAt).fromNow()
              : dayjs(item.createdAt).fromNow()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-[var(--color-text-primary)]">
              {formatLeaveEmployeeName(item.employee)} ·{' '}
              {formatLeaveType(item.leaveType)}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {item.requestNumber} · {formatProjectDate(item.startDate)} –{' '}
              {formatProjectDate(item.endDate)} ({item.days}d)
            </p>
          </div>
          <StatusBadge
            label={formatLeaveStatus(item.status)}
            variant={leaveStatusVariant(item.status)}
          />
        </Link>
      ))}
    </div>
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
    <div className={layout.sectionStack}>
      <div className={`${layout.cardSurface} ${layout.cardPadding}`}>
        <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
          {t('pages.dashboard.hr.title')}
        </h2>
        <p className="mt-1 mb-0 text-sm text-[var(--color-text-secondary)]">
          {t('pages.dashboard.hr.subtitle')}
        </p>
      </div>

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
                <p className="m-0 text-2xl font-semibold text-[var(--color-text-primary)]">
                  {card.value}
                </p>
                <p className="m-0 mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                  {card.subtext}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t('pages.dashboard.hr.recentLeave')}>
          <RecentLeaveList items={recentItems} />
          <div className="mt-3">
            <Link
              href="/hr/leave-requests"
              className="text-sm font-medium text-[var(--color-primary)]"
            >
              {t('pages.dashboard.hr.viewAllLeave')}
            </Link>
          </div>
        </SectionCard>

        <SectionCard title={t('pages.dashboard.hr.quickLinks')}>
          <div className="flex flex-col gap-1">
            {quickLinks.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className="rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-secondary)]"
              >
                <p className="m-0 text-sm font-medium text-[var(--color-text-primary)]">
                  {t(link.labelKey)}
                </p>
                <p className="m-0 text-xs text-[var(--color-text-tertiary)]">
                  {t(link.descriptionKey)}
                </p>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
