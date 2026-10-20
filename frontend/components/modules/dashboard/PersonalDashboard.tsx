'use client';

import Link from 'next/link';
import { Spin } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  FieldTimeOutlined,
} from '@ant-design/icons';
import {
  ChartCard,
  StatCard,
} from '@/components/modules/dashboard/DashboardStats';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useCanAccessOvertime } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useMyLeaveBalances, useMyLeaveRequests } from '@/lib/query/leave';
import { useCurrentOvertimeSheet } from '@/lib/query/overtime';
import { useMyUpcomingHolidays } from '@/lib/query/work-schedule';
import {
  formatLeaveStatus,
  formatLeaveType,
  leaveStatusVariant,
} from '@/lib/utils/leave-display';
import { leaveRequestDetailHref } from '@/lib/utils/hr-self-service-nav';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useAuthStore } from '@/stores/auth.store';

const PERSONAL = 'pages.dashboard.personal';
const HR = 'pages.dashboard.hr';
const PENDING_LEAVE_STATUSES = ['SUBMITTED', 'IN_REVIEW'] as const;

/**
 * Employee home dashboard - own HR stats (leave, overtime, holidays).
 * PM personal metrics stay unused while Project Management is hidden.
 */
export default function PersonalDashboard({
  enabled = true,
}: {
  enabled?: boolean;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const user = useAuthStore((state) => state.user);
  const canAccessOvertime = useCanAccessOvertime();
  const balancesQuery = useMyLeaveBalances({ enabled });
  const recentLeaveQuery = useMyLeaveRequests(
    { page: 1, limit: 8 },
    enabled,
  );
  const pendingLeaveQuery = useMyLeaveRequests(
    {
      page: 1,
      limit: 1,
      status: [...PENDING_LEAVE_STATUSES],
    },
    enabled,
  );
  const overtimeQuery = useCurrentOvertimeSheet(enabled && canAccessOvertime);
  const holidaysQuery = useMyUpcomingHolidays(60, enabled);

  const loading =
    (balancesQuery.isLoading || recentLeaveQuery.isLoading) &&
    !balancesQuery.data &&
    !recentLeaveQuery.data;

  if (loading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-dashboard-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  const annual = (balancesQuery.data ?? []).find(
    (balance) => balance.leaveType === 'ANNUAL',
  );
  const remaining = annual?.remaining ?? 0;
  const entitled = (annual?.entitled ?? 0) + (annual?.broughtForward ?? 0);
  const pendingLeave = pendingLeaveQuery.data?.meta.total ?? 0;
  const overtimeHours = overtimeQuery.data?.totalHours ?? 0;
  const holidays = holidaysQuery.data ?? [];
  const recentLeave = recentLeaveQuery.data?.data ?? [];

  const firstName = user?.firstName ?? t(`${HR}.greeting.fallbackName`);
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? t(`${HR}.greeting.morning`)
      : hour < 17
        ? t(`${HR}.greeting.afternoon`)
        : t(`${HR}.greeting.evening`);
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-GB';
  const today = new Date().toLocaleDateString(dateLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="erp-pro-list-page erp-users-page erp-dashboard-page">
      <div className="erp-dashboard-greeting erp-pro-card">
        <p className="erp-dashboard-greeting-eyebrow m-0">
          {t(`${PERSONAL}.title`)} · {today}
        </p>
        <h1 className="erp-dashboard-greeting-title m-0">
          {greeting}, {firstName}
        </h1>
      </div>

      <div className="erp-users-stat-bar erp-dashboard-stat-bar--4">
        <StatCard
          label={t(`${PERSONAL}.annualLeave`)}
          value={remaining}
          sub={
            entitled > 0
              ? t(`${PERSONAL}.ofEntitled`, { remaining, entitled })
              : t(`${PERSONAL}.noBalance`)
          }
          color={remaining > 0 ? 'teal' : 'default'}
          icon={<CalendarOutlined />}
          href="/hr/leave-requests"
        />
        <StatCard
          label={t(`${PERSONAL}.pendingLeave`)}
          value={pendingLeave}
          sub={t(`${PERSONAL}.pendingLeaveHint`)}
          color={pendingLeave > 0 ? 'blue' : 'default'}
          icon={<ClockCircleOutlined />}
          href="/hr/leave-requests"
        />
        <StatCard
          label={t(`${PERSONAL}.overtimeThisMonth`)}
          value={overtimeHours}
          sub={t(`${PERSONAL}.hoursShort`, { hours: overtimeHours })}
          color={overtimeHours > 0 ? 'amber' : 'default'}
          icon={<FieldTimeOutlined />}
          href={canAccessOvertime ? '/hr/overtime' : undefined}
        />
        <StatCard
          label={t(`${PERSONAL}.upcomingHolidays`)}
          value={holidays.length}
          sub={t(`${PERSONAL}.next60Days`)}
          color={holidays.length > 0 ? 'green' : 'default'}
          icon={<CalendarOutlined />}
          href="/profile"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <ChartCard
          title={t(`${PERSONAL}.myLeave`)}
          icon={<CalendarOutlined />}
          action={
            <Link
              href="/hr/leave-requests"
              className="text-xs font-medium text-[#1D9E75] no-underline hover:text-[#0F6E56]"
            >
              {t(`${HR}.viewAll`)}
            </Link>
          }
        >
          {recentLeave.length === 0 ? (
            <p className="erp-users-cell-sub m-0">{t(`${PERSONAL}.noLeave`)}</p>
          ) : (
            <div className="divide-y divide-[#eef1f4]">
              {recentLeave.map((req) => (
                <Link
                  key={req.id}
                  href={leaveRequestDetailHref(
                    req.id,
                    '/profile?tab=leave',
                  )}
                  className="flex items-center justify-between gap-3 py-3 no-underline first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="erp-users-cell-strong m-0 truncate">
                      {formatLeaveType(req.leaveType, t)}
                    </p>
                    <p className="erp-users-cell-sub m-0 mt-0.5">
                      {t(`${HR}.daysShort`, { days: req.days })} ·{' '}
                      {formatProjectDate(req.startDate)}
                    </p>
                  </div>
                  <StatusBadge
                    label={formatLeaveStatus(req.status, t)}
                    variant={leaveStatusVariant(req.status)}
                  />
                </Link>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard
          title={t(`${PERSONAL}.upcomingHolidays`)}
          subtitle={t(`${PERSONAL}.next60Days`)}
          icon={<CalendarOutlined />}
          action={
            <Link
              href="/profile"
              className="text-xs font-medium text-[#1D9E75] no-underline hover:text-[#0F6E56]"
            >
              {t(`${HR}.viewAll`)}
            </Link>
          }
        >
          {holidays.length === 0 ? (
            <p className="erp-users-cell-sub m-0">
              {t('profile.noUpcomingHolidays')}
            </p>
          ) : (
            <div className="divide-y divide-[#eef1f4]">
              {holidays.slice(0, 8).map((holiday) => {
                const primary =
                  locale === 'zh' && holiday.nameZh
                    ? holiday.nameZh
                    : holiday.name;
                const daysLabel =
                  holiday.daysUntil === 0
                    ? t('profile.holidayToday')
                    : holiday.daysUntil === 1
                      ? t('profile.holidayTomorrow')
                      : t('profile.holidayInDays', {
                          count: holiday.daysUntil,
                        });
                return (
                  <div
                    key={`${holiday.id}-${holiday.date}`}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="erp-users-cell-strong m-0 truncate">
                        {primary}
                      </p>
                      <p className="erp-users-cell-sub m-0 mt-0.5">
                        {formatProjectDate(holiday.date)}
                      </p>
                    </div>
                    <span className="flex-shrink-0 text-xs font-medium text-[#1D9E75]">
                      {daysLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
