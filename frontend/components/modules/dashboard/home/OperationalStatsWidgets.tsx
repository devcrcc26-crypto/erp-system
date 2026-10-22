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
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useDashboardOperationalStats } from '@/lib/query/dashboard';
import WidgetCard, { WidgetFigure } from './WidgetCard';
import { formatCount } from './format';

const STATS = 'pages.dashboard.home.stats';
const ICON = { size: 18, strokeWidth: 1.9 } as const;
const KPI_ICON = { size: 18, strokeWidth: 1.9 } as const;

function toneClass(tone: 'ok' | 'warn' | 'urgent' | undefined): string {
  if (tone === 'ok') return 'dv2-number--ok';
  if (tone === 'warn') return 'dv2-number--warn';
  if (tone === 'urgent') return 'dv2-number--urgent';
  return '';
}

function kpiToneClass(tone: 'ok' | 'warn' | 'urgent' | undefined): string {
  if (tone === 'ok') return 'dv2-kpi-value--ok';
  if (tone === 'warn') return 'dv2-kpi-value--warn';
  if (tone === 'urgent') return 'dv2-kpi-value--urgent';
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

function ProgressBar({
  label,
  current,
  total,
  locale,
  strong,
}: {
  label: string;
  current: number;
  total: number;
  locale: string;
  strong?: boolean;
}): React.ReactNode {
  const percent =
    total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className="dv2-progress-block">
      <div className="dv2-progress-head">
        <span>{label}</span>
        <span>
          {formatCount(current, locale)}
          {total > 0 ? ` / ${formatCount(total, locale)}` : null}
        </span>
      </div>
      <div
        className="dv2-progress"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <span
          className={strong ? 'dv2-progress-fill--strong' : undefined}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'ok' | 'warn' | 'urgent';
}): React.ReactNode {
  const toneClassName =
    tone === 'ok'
      ? 'dv2-pill--ok'
      : tone === 'warn'
        ? 'dv2-pill--warn'
        : tone === 'urgent'
          ? 'dv2-pill--urgent'
          : '';
  return <span className={`dv2-pill ${toneClassName}`}>{children}</span>;
}

/**
 * Role-adapted operational statistic cards from GET /dashboard/stats.
 * Headcount KPIs use the floating-tile strip; detail cards match widget v2.
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

      {showHrBlocks && stats?.headcount ? (
        <div className="dv2-span-12">
          <ul className="dv2-kpi-strip" aria-label={t(`${STATS}.headcount.title`)}>
            <li>
              <div className="dv2-kpi">
                <div className="dv2-kpi-head">
                  <span className="dv2-kpi-icon" aria-hidden>
                    <Users {...KPI_ICON} />
                  </span>
                </div>
                <p className="dv2-kpi-label">{t(`${STATS}.headcount.total`)}</p>
                <p className="dv2-kpi-value">
                  {formatCount(stats.headcount.total, locale)}
                </p>
              </div>
            </li>
            <li>
              <div className="dv2-kpi">
                <div className="dv2-kpi-head">
                  <span className="dv2-kpi-icon" aria-hidden>
                    <CalendarDays {...KPI_ICON} />
                  </span>
                </div>
                <p className="dv2-kpi-label">
                  {t(`${STATS}.headcount.onLeaveToday`)}
                </p>
                <p className="dv2-kpi-value">
                  {formatCount(stats.headcount.onLeaveToday, locale)}
                </p>
              </div>
            </li>
            <li>
              <div className="dv2-kpi">
                <div className="dv2-kpi-head">
                  <span className="dv2-kpi-icon" aria-hidden>
                    <UserCheck {...KPI_ICON} />
                  </span>
                </div>
                <p className="dv2-kpi-label">
                  {t(`${STATS}.headcount.newThisMonth`)}
                </p>
                <p
                  className={`dv2-kpi-value ${kpiToneClass(
                    stats.headcount.newThisMonth > 0 ? 'ok' : undefined,
                  )}`}
                >
                  {formatCount(stats.headcount.newThisMonth, locale)}
                </p>
              </div>
            </li>
            {stats.contractsExpiring ? (
              <li>
                <Link href="/hr/employee-contract" className="dv2-kpi">
                  <div className="dv2-kpi-head">
                    <span
                      className={`dv2-kpi-icon${
                        stats.contractsExpiring.within30 > 0
                          ? ' dv2-kpi-icon--urgent'
                          : ''
                      }`}
                      aria-hidden
                    >
                      <FileSignature {...KPI_ICON} />
                    </span>
                  </div>
                  <p className="dv2-kpi-label">
                    {t(`${STATS}.contracts.within30`)}
                  </p>
                  <p
                    className={`dv2-kpi-value ${kpiToneClass(
                      stats.contractsExpiring.within30 > 0
                        ? 'urgent'
                        : undefined,
                    )}`}
                  >
                    {formatCount(stats.contractsExpiring.within30, locale)}
                  </p>
                  <p className="dv2-kpi-hint">
                    {t(`${STATS}.contracts.title`)}
                  </p>
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
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
                <div className="dv2-pills">
                  <Pill
                    tone={
                      stats.attendance.importStatus === 'imported'
                        ? 'ok'
                        : undefined
                    }
                  >
                    {t(
                      `${STATS}.attendance.import.${stats.attendance.importStatus}`,
                    )}
                  </Pill>
                  <Pill
                    tone={
                      stats.attendance.approvalStatus === 'approved'
                        ? 'ok'
                        : stats.attendance.approvalStatus === 'in_progress'
                          ? 'warn'
                          : undefined
                    }
                  >
                    {t(
                      `${STATS}.attendance.approval.${stats.attendance.approvalStatus}`,
                    )}
                  </Pill>
                </div>
              </div>
              <ProgressBar
                label={t(`${STATS}.attendance.submitted`)}
                current={stats.attendance.submittedCount}
                total={stats.attendance.totalEmployees}
                locale={locale}
              />
              <ProgressBar
                label={t(`${STATS}.attendance.approved`)}
                current={stats.attendance.approvedCount}
                total={stats.attendance.totalEmployees}
                locale={locale}
                strong
              />
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
