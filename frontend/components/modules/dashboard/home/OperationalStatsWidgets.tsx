'use client';

import Link from 'next/link';
import {
  CalendarDays,
  FileSignature,
  MapPin,
  Timer,
  Users,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { Progress, Tag } from 'antd';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useDashboardOperationalStats } from '@/lib/query/dashboard';
import WidgetCard, { WidgetFigure } from './WidgetCard';
import { formatCount } from './format';

const STATS = 'pages.dashboard.home.stats';
const ICON = { size: 18, strokeWidth: 1.9 } as const;

function toneClass(tone: 'ok' | 'warn' | 'urgent' | undefined): string {
  if (tone === 'ok') return 'dv2-number--ok';
  if (tone === 'warn') return 'dv2-number--warn';
  if (tone === 'urgent') return 'dv2-number--urgent';
  return '';
}

function Stat({
  label,
  value,
  tone,
  locale,
}: {
  label: string;
  value: number | string;
  tone?: 'ok' | 'warn' | 'urgent';
  locale: string;
}): React.ReactNode {
  const display =
    typeof value === 'number' ? formatCount(value, locale) : value;
  return (
    <div className="dv2-figure">
      <p className="dv2-hint m-0">{label}</p>
      <p className={`dv2-number m-0 ${toneClass(tone)}`}>{display}</p>
    </div>
  );
}

/**
 * Role-adapted operational statistic cards from GET /dashboard/stats.
 */
export default function OperationalStatsWidgets({
  enabled,
}: {
  enabled: boolean;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const canViewHr = useCanViewHr();
  const query = useDashboardOperationalStats(enabled);
  const stats = query.data;
  const visibility = stats?.visibility;
  const showHrBlocks = canViewHr || visibility?.headcount === true;
  const showSite = canViewHr || visibility?.siteAssignments === true;
  const showPersonal = !canViewHr;

  return (
    <>
      {showPersonal ? (
        <WidgetCard
          title={t(`${STATS}.personal.title`)}
          icon={<Users {...ICON} />}
          span={12}
          query={query}
        >
          {stats?.personal ? (
            <div className="dv2-stat-row">
              <Stat
                label={t(`${STATS}.personal.leaveBalance`)}
                value={
                  stats.personal.myLeaveBalanceDays == null
                    ? '—'
                    : stats.personal.myLeaveBalanceDays
                }
                locale={locale}
              />
              <Stat
                label={t(`${STATS}.personal.otHours`)}
                value={stats.personal.myOtHoursThisMonth}
                locale={locale}
              />
              <Stat
                label={t(`${STATS}.personal.pendingRequests`)}
                value={stats.personal.myPendingRequestCount}
                locale={locale}
              />
              <div className="dv2-figure">
                <p className="dv2-hint m-0">
                  {t(`${STATS}.personal.upcomingSite`)}
                </p>
                <p className="dv2-strong m-0">
                  {stats.personal.upcomingSiteAssignment
                    ? `${stats.personal.upcomingSiteAssignment.siteName} (${stats.personal.upcomingSiteAssignment.startDate} → ${stats.personal.upcomingSiteAssignment.endDate})`
                    : t(`${STATS}.personal.noSite`)}
                </p>
              </div>
            </div>
          ) : null}
        </WidgetCard>
      ) : null}

      {showHrBlocks ? (
        <WidgetCard
          title={t(`${STATS}.headcount.title`)}
          icon={<Users {...ICON} />}
          span={12}
          query={query}
        >
          {stats?.headcount ? (
            <div className="dv2-stat-row">
              <Stat
                label={t(`${STATS}.headcount.total`)}
                value={stats.headcount.total}
                locale={locale}
              />
              <Stat
                label={t(`${STATS}.headcount.onLeaveToday`)}
                value={stats.headcount.onLeaveToday}
                locale={locale}
              />
              <Stat
                label={t(`${STATS}.headcount.newThisMonth`)}
                value={stats.headcount.newThisMonth}
                tone={stats.headcount.newThisMonth > 0 ? 'ok' : undefined}
                locale={locale}
              />
            </div>
          ) : null}
        </WidgetCard>
      ) : null}

      {showHrBlocks ? (
        <WidgetCard
          title={t(`${STATS}.attendance.title`)}
          icon={<UserCheck {...ICON} />}
          span={12}
          viewAllHref="/hr/attendance"
          query={query}
        >
          {stats?.attendance ? (
            <>
              <div className="dv2-stat-row dv2-stat-row--align">
                <p className="dv2-label m-0">{stats.attendance.month}</p>
                <Tag
                  color={
                    stats.attendance.importStatus === 'imported'
                      ? 'green'
                      : 'default'
                  }
                >
                  {t(
                    `${STATS}.attendance.import.${stats.attendance.importStatus}`,
                  )}
                </Tag>
                <Tag
                  color={
                    stats.attendance.approvalStatus === 'approved'
                      ? 'green'
                      : stats.attendance.approvalStatus === 'in_progress'
                        ? 'orange'
                        : 'default'
                  }
                >
                  {t(
                    `${STATS}.attendance.approval.${stats.attendance.approvalStatus}`,
                  )}
                </Tag>
              </div>
              <div className="dv2-progress-block">
                <div className="dv2-progress-head">
                  <span>{t(`${STATS}.attendance.submitted`)}</span>
                  <span>
                    {formatCount(stats.attendance.submittedCount, locale)} /{' '}
                    {formatCount(stats.attendance.totalEmployees, locale)}
                  </span>
                </div>
                <Progress
                  percent={
                    stats.attendance.totalEmployees > 0
                      ? Math.round(
                          (stats.attendance.submittedCount /
                            stats.attendance.totalEmployees) *
                            100,
                        )
                      : 0
                  }
                  showInfo={false}
                  strokeColor="#1D9E75"
                />
              </div>
              <div className="dv2-progress-block">
                <div className="dv2-progress-head">
                  <span>{t(`${STATS}.attendance.approved`)}</span>
                  <span>
                    {formatCount(stats.attendance.approvedCount, locale)}
                  </span>
                </div>
                <Progress
                  percent={
                    stats.attendance.totalEmployees > 0
                      ? Math.round(
                          (stats.attendance.approvedCount /
                            stats.attendance.totalEmployees) *
                            100,
                        )
                      : 0
                  }
                  showInfo={false}
                  strokeColor="#0F6E56"
                />
              </div>
              {canViewHr &&
              stats.attendance.importStatus === 'not_imported' ? (
                <Link href="/hr/attendance" className="dv2-inline-link">
                  {t(`${STATS}.attendance.importAction`)}
                </Link>
              ) : null}
            </>
          ) : null}
        </WidgetCard>
      ) : null}

      <WidgetCard
        title={t(`${STATS}.overtime.title`)}
        icon={<Timer {...ICON} />}
        span={6}
        viewAllHref="/hr/overtime"
        query={query}
      >
        {stats ? (
          <>
            <WidgetFigure
              label={t(`${STATS}.overtime.totalHours`)}
              value={formatCount(stats.overtime.totalHours, locale)}
            />
            <div className="dv2-stat-row">
              <Stat
                label={t(`${STATS}.overtime.pending`)}
                value={stats.overtime.pendingApprovalCount}
                locale={locale}
              />
              <Stat
                label={t(`${STATS}.overtime.approved`)}
                value={stats.overtime.approvedCount}
                locale={locale}
              />
              <Stat
                label={t(`${STATS}.overtime.employees`)}
                value={stats.overtime.employeesWithOT}
                locale={locale}
              />
            </div>
          </>
        ) : null}
      </WidgetCard>

      <WidgetCard
        title={t(`${STATS}.leave.title`)}
        icon={<CalendarDays {...ICON} />}
        span={6}
        viewAllHref="/approvals"
        query={query}
      >
        {stats ? (
          <>
            <WidgetFigure
              label={t(`${STATS}.leave.pending`)}
              value={formatCount(stats.leave.pendingApprovalCount, locale)}
            />
            <div className="dv2-stat-row">
              <Stat
                label={t(`${STATS}.leave.onLeave`)}
                value={stats.leave.currentlyOnLeave}
                locale={locale}
              />
              <Stat
                label={t(`${STATS}.leave.thisMonth`)}
                value={stats.leave.thisMonthRequests}
                locale={locale}
              />
            </div>
          </>
        ) : null}
      </WidgetCard>

      {showSite ? (
        <WidgetCard
          title={t(`${STATS}.siteAssignments.title`)}
          icon={<MapPin {...ICON} />}
          span={6}
          viewAllHref="/hr/site-assignments"
          query={query}
        >
          {stats?.siteAssignments ? (
            <>
              <WidgetFigure
                label={t(`${STATS}.siteAssignments.current`)}
                value={formatCount(
                  stats.siteAssignments.currentlyAssigned,
                  locale,
                )}
              />
              <div className="dv2-stat-row">
                <Stat
                  label={t(`${STATS}.siteAssignments.expiring7`)}
                  value={stats.siteAssignments.expiringIn7Days}
                  tone={
                    stats.siteAssignments.expiringIn7Days > 0
                      ? 'warn'
                      : undefined
                  }
                  locale={locale}
                />
                <Stat
                  label={t(`${STATS}.siteAssignments.expiring30`)}
                  value={stats.siteAssignments.expiringIn30Days}
                  locale={locale}
                />
              </div>
            </>
          ) : null}
        </WidgetCard>
      ) : null}

      <WidgetCard
        title={t(`${STATS}.perDiem.title`)}
        icon={<Wallet {...ICON} />}
        span={6}
        viewAllHref="/hr/per-diem"
        query={query}
      >
        {stats?.perDiem ? (
          <>
            <div className="dv2-figure">
              <p className="dv2-hint m-0">
                {t(`${STATS}.perDiem.pendingSettlement`)}
              </p>
              <p
                className={`dv2-number m-0 ${
                  stats.perDiem.pendingSettlement > 0
                    ? 'dv2-number--urgent'
                    : ''
                }`}
              >
                {formatCount(stats.perDiem.pendingSettlement, locale)}
              </p>
            </div>
            <div className="dv2-stat-row">
              <Stat
                label={t(`${STATS}.perDiem.pendingApproval`)}
                value={stats.perDiem.pendingApproval}
                locale={locale}
              />
            </div>
          </>
        ) : null}
      </WidgetCard>

      {showHrBlocks ? (
        <WidgetCard
          title={t(`${STATS}.contracts.title`)}
          icon={<FileSignature {...ICON} />}
          span={12}
          viewAllHref="/hr/employee-contract"
          query={query}
        >
          {stats?.contractsExpiring ? (
            <div className="dv2-stat-row">
              <Stat
                label={t(`${STATS}.contracts.within30`)}
                value={stats.contractsExpiring.within30}
                tone={
                  stats.contractsExpiring.within30 > 0 ? 'urgent' : undefined
                }
                locale={locale}
              />
              <Stat
                label={t(`${STATS}.contracts.within60`)}
                value={stats.contractsExpiring.within60}
                tone={
                  stats.contractsExpiring.within60 > 0 ? 'warn' : undefined
                }
                locale={locale}
              />
              <Stat
                label={t(`${STATS}.contracts.within90`)}
                value={stats.contractsExpiring.within90}
                locale={locale}
              />
              <Stat
                label={t(`${STATS}.contracts.expired`)}
                value={stats.contractsExpiring.expiredUnrenewed}
                tone={
                  stats.contractsExpiring.expiredUnrenewed > 0
                    ? 'urgent'
                    : undefined
                }
                locale={locale}
              />
            </div>
          ) : null}
        </WidgetCard>
      ) : null}
    </>
  );
}
