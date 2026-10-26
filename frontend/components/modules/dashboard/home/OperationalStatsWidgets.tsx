'use client';

import Link from 'next/link';
import { Button, Skeleton } from 'antd';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  FileClock,
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
import WidgetCard, { WidgetFigure, type WidgetSpan } from './WidgetCard';
import { formatCount } from './format';

export const STATS = 'pages.dashboard.home.stats';
const ICON = { size: 18, strokeWidth: 1.9 } as const;
const KPI_ICON = { size: 18, strokeWidth: 1.9 } as const;

export type Tone = 'ok' | 'warn' | 'urgent';

function toneClass(tone: Tone | undefined): string {
  if (tone === 'ok') return 'dv2-number--ok';
  if (tone === 'warn') return 'dv2-number--warn';
  if (tone === 'urgent') return 'dv2-number--urgent';
  return '';
}

function kpiToneClass(tone: Tone | undefined): string {
  if (tone === 'ok') return 'dv2-kpi-value--ok';
  if (tone === 'warn') return 'dv2-kpi-value--warn';
  if (tone === 'urgent') return 'dv2-kpi-value--urgent';
  return '';
}

/** Small labelled figure used inside a stat row. */
export function Stat({
  label,
  value,
  tone,
  locale,
}: {
  label: string;
  value: number | string;
  tone?: Tone;
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

/** Labelled progress bar showing `current / total`. */
export function ProgressBar({
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

/** Rounded status pill. */
export function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: Tone;
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

/** Floating KPI tile; renders as a link when `href` is given. */
export function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  href?: string;
}): React.ReactNode {
  const iconTone = tone === 'urgent' || tone === 'warn' ? ` dv2-kpi-icon--${tone}` : '';
  const content = (
    <>
      <div className="dv2-kpi-head">
        <p className="dv2-kpi-label">{label}</p>
        <span className={`dv2-kpi-icon${iconTone}`} aria-hidden>
          <Icon {...KPI_ICON} />
        </span>
      </div>
      <p className={`dv2-kpi-value ${kpiToneClass(tone)}`}>{value}</p>
      {hint ? <p className="dv2-kpi-hint">{hint}</p> : null}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="dv2-kpi">
          {content}
        </Link>
      ) : (
        <div className="dv2-kpi">{content}</div>
      )}
    </li>
  );
}

/**
 * Top-of-page stat strip: company headcount for HR (or anyone the API grants
 * headcount), otherwise the viewer's own leave / overtime / request figures.
 * No longer used by the tabbed dashboard; kept for other consumers.
 */
export function DashboardKpiStrip({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const canViewHr = useCanViewHr();
  const query = useDashboardOperationalStats(enabled);
  const stats = query.data;
  const showHeadcount = canViewHr || stats?.visibility?.headcount === true;
  const label = t('pages.dashboard.home.sections.summary');

  if (query.isLoading) {
    return (
      <ul className="dv2-kpi-strip" aria-label={label} aria-busy="true">
        {[0, 1, 2, 3].map((key) => (
          <li key={key}>
            <div className="dv2-kpi">
              <Skeleton active title={false} paragraph={{ rows: 2 }} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (query.isError) {
    return (
      <div className="dv2-error" role="alert">
        <p className="m-0">{t('pages.dashboard.home.loadFailed')}</p>
        <Button size="small" onClick={() => void query.refetch()}>
          {t('pages.dashboard.home.retry')}
        </Button>
      </div>
    );
  }

  if (showHeadcount && stats?.headcount) {
    const within30 = stats.contractsExpiring?.within30 ?? 0;
    return (
      <ul className="dv2-kpi-strip" aria-label={t(`${STATS}.headcount.title`)}>
        <KpiTile
          icon={Users}
          label={t(`${STATS}.headcount.total`)}
          value={formatCount(stats.headcount.total, locale)}
        />
        <KpiTile
          icon={CalendarDays}
          label={t(`${STATS}.headcount.onLeaveToday`)}
          value={formatCount(stats.headcount.onLeaveToday, locale)}
        />
        <KpiTile
          icon={UserCheck}
          label={t(`${STATS}.headcount.newThisMonth`)}
          value={formatCount(stats.headcount.newThisMonth, locale)}
          tone={stats.headcount.newThisMonth > 0 ? 'ok' : undefined}
        />
        {stats.contractsExpiring ? (
          <KpiTile
            icon={FileSignature}
            label={t(`${STATS}.contracts.within30`)}
            value={formatCount(within30, locale)}
            hint={t(`${STATS}.contracts.title`)}
            tone={within30 > 0 ? 'urgent' : undefined}
            href="/hr/employee-contract"
          />
        ) : null}
      </ul>
    );
  }

  const personal = stats?.personal;
  if (!personal) {
    return null;
  }
  const site = personal.upcomingSiteAssignment;
  return (
    <ul className="dv2-kpi-strip" aria-label={t(`${STATS}.personal.title`)}>
      <KpiTile
        icon={CalendarDays}
        label={t(`${STATS}.personal.leaveBalance`)}
        value={
          personal.myLeaveBalanceDays == null
            ? '—'
            : formatCount(personal.myLeaveBalanceDays, locale)
        }
        href="/hr/leave-requests"
      />
      <KpiTile
        icon={Timer}
        label={t(`${STATS}.personal.otHours`)}
        value={formatCount(personal.myOtHoursThisMonth, locale)}
      />
      <KpiTile
        icon={FileClock}
        label={t(`${STATS}.personal.pendingRequests`)}
        value={formatCount(personal.myPendingRequestCount, locale)}
        tone={personal.myPendingRequestCount > 0 ? 'warn' : undefined}
        href="/approvals"
      />
      <KpiTile
        icon={MapPin}
        label={t(`${STATS}.personal.upcomingSite`)}
        value={site ? site.siteName : t(`${STATS}.personal.noSite`)}
        hint={site ? `${site.startDate} → ${site.endDate}` : undefined}
      />
    </ul>
  );
}

/** Attendance import / approval progress for the current month (HR). */
export function AttendanceStatsCard({
  enabled,
  span = 12,
}: {
  enabled: boolean;
  span?: WidgetSpan;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const canViewHr = useCanViewHr();
  const query = useDashboardOperationalStats(enabled);
  const stats = query.data;
  const visible = canViewHr || stats?.visibility?.headcount === true;
  if (!visible) {
    return null;
  }

  return (
    <WidgetCard
      title={t(`${STATS}.attendance.title`)}
      icon={<UserCheck {...ICON} />}
      span={span}
      viewAllHref="/hr/attendance"
      query={query}
      isEmpty={!stats?.attendance}
      emptyLabel={t('pages.dashboard.home.overview.noAttendance')}
    >
      {stats?.attendance ? (
        <>
          <div className="dv2-stat-row dv2-stat-row--align">
            <p className="dv2-label m-0">{stats.attendance.month}</p>
            <div className="dv2-pills">
              <Pill
                tone={
                  stats.attendance.importStatus === 'imported' ? 'ok' : undefined
                }
              >
                {t(`${STATS}.attendance.import.${stats.attendance.importStatus}`)}
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
                {t(`${STATS}.attendance.approval.${stats.attendance.approvalStatus}`)}
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
          {canViewHr && stats.attendance.importStatus === 'not_imported' ? (
            <Link href="/hr/attendance" className="dv2-inline-link">
              {t(`${STATS}.attendance.importAction`)}
            </Link>
          ) : null}
        </>
      ) : null}
    </WidgetCard>
  );
}

/** Company overtime totals for the current month. */
export function OvertimeStatsCard({
  enabled,
  span = 6,
}: {
  enabled: boolean;
  span?: WidgetSpan;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const query = useDashboardOperationalStats(enabled);
  const stats = query.data;

  return (
    <WidgetCard
      title={t(`${STATS}.overtime.title`)}
      icon={<Timer {...ICON} />}
      span={span}
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
  );
}

/** Pending / current leave figures (counts only; no chart). */
export function LeaveStatsCard({
  enabled,
  span = 6,
}: {
  enabled: boolean;
  span?: WidgetSpan;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const query = useDashboardOperationalStats(enabled);
  const stats = query.data;

  return (
    <WidgetCard
      title={t(`${STATS}.leave.title`)}
      icon={<CalendarDays {...ICON} />}
      span={span}
      viewAllHref="/hr/leave-requests"
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
  );
}

/** Site assignment counts; null when the viewer cannot see them. */
export function SiteAssignmentsStatsCard({
  enabled,
  span = 6,
}: {
  enabled: boolean;
  span?: WidgetSpan;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const canViewHr = useCanViewHr();
  const query = useDashboardOperationalStats(enabled);
  const stats = query.data;
  const visible = canViewHr || stats?.visibility?.siteAssignments === true;
  if (!visible) {
    return null;
  }

  return (
    <WidgetCard
      title={t(`${STATS}.siteAssignments.title`)}
      icon={<MapPin {...ICON} />}
      span={span}
      viewAllHref="/hr/site-assignments"
      query={query}
    >
      {stats?.siteAssignments ? (
        <>
          <WidgetFigure
            label={t(`${STATS}.siteAssignments.current`)}
            value={formatCount(stats.siteAssignments.currentlyAssigned, locale)}
          />
          <div className="dv2-stat-row">
            <Stat
              label={t(`${STATS}.siteAssignments.expiring7`)}
              value={stats.siteAssignments.expiringIn7Days}
              tone={stats.siteAssignments.expiringIn7Days > 0 ? 'warn' : undefined}
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
  );
}

/** Per diem settlement / approval backlog. */
export function PerDiemStatsCard({
  enabled,
  span = 6,
}: {
  enabled: boolean;
  span?: WidgetSpan;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const query = useDashboardOperationalStats(enabled);
  const stats = query.data;

  return (
    <WidgetCard
      title={t(`${STATS}.perDiem.title`)}
      icon={<Wallet {...ICON} />}
      span={span}
      viewAllHref="/hr/per-diem"
      query={query}
      isEmpty={!stats?.perDiem}
      emptyLabel={t('pages.dashboard.home.operations.noPerDiem')}
    >
      {stats?.perDiem ? (
        <>
          <WidgetFigure
            label={t(`${STATS}.perDiem.pendingSettlement`)}
            value={formatCount(stats.perDiem.pendingSettlement, locale)}
          />
          <div className="dv2-stat-row">
            <Stat
              label={t(`${STATS}.perDiem.pendingApproval`)}
              value={stats.perDiem.pendingApproval}
              tone={stats.perDiem.pendingApproval > 0 ? 'warn' : undefined}
              locale={locale}
            />
          </div>
        </>
      ) : null}
    </WidgetCard>
  );
}

/**
 * Role-adapted operational statistic cards from GET /dashboard/stats.
 *
 * `variant="operations"` is used on the Operations tab: it omits the contracts
 * card, because contracts are shown only on the Overview tab. The default
 * `all` variant keeps the previous behaviour (including contracts).
 */
export default function OperationalStatsWidgets({
  enabled,
  variant = 'all',
}: {
  enabled: boolean;
  variant?: 'all' | 'operations';
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const canViewHr = useCanViewHr();
  const query = useDashboardOperationalStats(enabled);
  const stats = query.data;
  const visibility = stats?.visibility;
  const showHrBlocks = canViewHr || visibility?.headcount === true;
  const showSite = canViewHr || visibility?.siteAssignments === true;
  const showContracts = variant === 'all' && showHrBlocks;

  return (
    <>
      <AttendanceStatsCard enabled={enabled} span={12} />
      <OvertimeStatsCard enabled={enabled} span={6} />
      <LeaveStatsCard enabled={enabled} span={6} />
      <SiteAssignmentsStatsCard enabled={enabled} span={6} />
      <PerDiemStatsCard enabled={enabled} span={showSite ? 6 : 12} />

      {showContracts ? (
        <WidgetCard
          title={t(`${STATS}.contracts.title`)}
          icon={<FileSignature {...ICON} />}
          span={canViewHr ? 6 : 12}
          viewAllHref="/hr/employee-contract"
          query={query}
        >
          {stats?.contractsExpiring ? (
            <div className="dv2-stat-row">
              <Stat
                label={t(`${STATS}.contracts.within30`)}
                value={stats.contractsExpiring.within30}
                tone={stats.contractsExpiring.within30 > 0 ? 'urgent' : undefined}
                locale={locale}
              />
              <Stat
                label={t(`${STATS}.contracts.within60`)}
                value={stats.contractsExpiring.within60}
                tone={stats.contractsExpiring.within60 > 0 ? 'warn' : undefined}
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
                  stats.contractsExpiring.expiredUnrenewed > 0 ? 'urgent' : undefined
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
