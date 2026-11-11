'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Select, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CalendarOutlined } from '@ant-design/icons';
import FieldMovementForm from '@/components/modules/profile/FieldMovementForm';
import ProfileContractPeriodSelect from '@/components/modules/profile/ProfileContractPeriodSelect';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useProfileContractPeriod } from '@/hooks/use-profile-contract-period';
import type {
  AttendanceDailyLog,
  AttendanceRecord,
  FlaggedDay,
} from '@/lib/api/attendance.types';
import {
  useEmployeeAttendance,
  useMyAttendance,
  useMyFlaggedDays,
} from '@/lib/query/attendance';
import {
  attendanceFlagTagColor,
  formatAttendanceDayFlag,
} from '@/lib/utils/attendance-flag-display';
import {
  calendarYearsInContractPeriod,
  monthOverlapsContractPeriod,
  type ProfileContractPeriod,
} from '@/lib/utils/contract-period';

type AttendanceYearRecord = AttendanceRecord & { monthName: string };

export interface EmployeeAttendanceProfileSectionProps {
  employeeId: string;
  /** When true, calls GET /hr/attendance/me; otherwise the employee year endpoint. */
  isOwnProfile: boolean;
  /** Reserved for future tenant-scoped UI; company is resolved from the JWT. */
  companyId?: string;
  /** Optional month from notification deep-link (`?month=`). */
  initialMonth?: number;
  /** Optional year from notification deep-link (`?year=`). */
  initialYear?: number;
  contractPeriod?: ProfileContractPeriod | null;
  contractPeriods?: ProfileContractPeriod[];
  contractPeriodLoading?: boolean;
  onContractPeriodChange?: (contractId: string) => void;
  hidePeriodControl?: boolean;
}

function formatNumber(value: number | string | null | undefined): string {
  if (value == null || value === '') {
    return '0';
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return '0';
  }
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

function AttendanceProfileSection({
  title,
  action,
  children,
  bodyClassName = '',
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}): React.ReactNode {
  return (
    <div className="erp-employee-section">
      <div className="erp-employee-section-header">
        <h3 className="erp-employee-section-title">{title}</h3>
        {action ? <div className="erp-employee-section-extra">{action}</div> : null}
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
  meta,
}: {
  label: string;
  value: string;
  accent: string;
  meta?: string;
}): React.ReactNode {
  return (
    <article className="erp-leave-balance-card">
      <div className="erp-leave-balance-card-head">
        <span
          className="erp-leave-balance-dot"
          style={{ background: accent }}
          aria-hidden
        />
        <p className="erp-leave-balance-label">{label}</p>
      </div>
      <p className="erp-leave-balance-value">
        <span className="erp-leave-balance-remaining" style={{ color: accent }}>
          {value}
        </span>
      </p>
      {meta ? <p className="erp-leave-balance-meta">{meta}</p> : null}
    </article>
  );
}

function dayStatusLabel(
  log: AttendanceDailyLog,
  t: (key: string) => string,
): string {
  if (log.dayStatus === 'DAY_OFF' || log.dayStatus === 'SUNDAY') {
    return t('pages.hr.attendance.review.dayStatus.DAY_OFF');
  }
  if (log.dayStatus === 'WORKED_ON_DAY_OFF') {
    return t('pages.hr.attendance.review.dayStatus.WORKED_ON_DAY_OFF');
  }
  if (log.dayStatus === 'UNPAID_LEAVE') {
    return t('pages.hr.attendance.review.dayStatus.UNPAID_LEAVE');
  }
  if (log.isHoliday || log.dayStatus === 'HOLIDAY') {
    return t('pages.hr.attendance.daily.holiday');
  }
  if (log.isWeekend) {
    return t('pages.hr.attendance.review.dayStatus.DAY_OFF');
  }
  if (log.isHalfDay) {
    return t('pages.hr.attendance.daily.halfDay');
  }
  if (!log.wasPresent) {
    return t('pages.hr.attendance.daily.absent');
  }
  return t('pages.hr.attendance.daily.workingDay');
}

function dailyRowClassName(log: AttendanceDailyLog): string {
  if (log.isHoliday) {
    return 'bg-[#E8F1FB]';
  }
  if (log.isWeekend) {
    return 'bg-[#F5F6F7]';
  }
  if (!log.wasPresent) {
    return 'bg-[#FCEBEB]';
  }
  return '';
}

function DailyLogsTable({
  logs,
  t,
}: {
  logs: AttendanceDailyLog[];
  t: (key: string, vars?: Record<string, string | number>) => string;
}): React.ReactNode {
  const columns: ColumnsType<AttendanceDailyLog> = [
    {
      title: t('pages.hr.attendance.daily.date'),
      key: 'date',
      width: 110,
      render: (_: unknown, row: AttendanceDailyLog) =>
        String(row.date).slice(0, 10),
    },
    {
      title: t('pages.hr.attendance.daily.day'),
      key: 'day',
      width: 90,
      render: (_: unknown, row: AttendanceDailyLog) => {
        const date = new Date(row.date);
        return date.toLocaleDateString(undefined, { weekday: 'short' });
      },
    },
    {
      title: t('pages.hr.attendance.daily.status'),
      key: 'status',
      width: 120,
      render: (_: unknown, row: AttendanceDailyLog) => (
        <Tag>{dayStatusLabel(row, t)}</Tag>
      ),
    },
    {
      title: t('pages.hr.attendance.daily.holidayName'),
      key: 'holidayName',
      width: 140,
      ellipsis: true,
      render: (_: unknown, row: AttendanceDailyLog) =>
        row.holidayName ?? '-',
    },
    {
      title: t('pages.hr.attendance.daily.clockIn'),
      key: 'clockIn',
      width: 90,
      render: (_: unknown, row: AttendanceDailyLog) => (
        <span
          style={
            row.isLate ? { color: '#BA7517', fontWeight: 600 } : undefined
          }
        >
          {row.clockInLocal ?? '-'}
        </span>
      ),
    },
    {
      title: t('pages.hr.attendance.daily.clockOut'),
      key: 'clockOut',
      width: 90,
      render: (_: unknown, row: AttendanceDailyLog) => (
        <span
          style={
            row.missingClockOut
              ? { color: '#BA7517', fontWeight: 600 }
              : undefined
          }
        >
          {row.clockOutLocal ?? (row.missingClockOut ? '-' : '-')}
        </span>
      ),
    },
    {
      title: t('pages.hr.attendance.daily.hours'),
      key: 'hours',
      width: 80,
      align: 'right',
      render: (_: unknown, row: AttendanceDailyLog) =>
        row.recordedHours == null ? '-' : formatNumber(row.recordedHours),
    },
    {
      title: t('pages.hr.attendance.daily.late'),
      key: 'late',
      width: 120,
      render: (_: unknown, row: AttendanceDailyLog) =>
        row.isLate
          ? t('pages.hr.attendance.daily.yesLate', {
              minutes: row.lateMinutes,
            })
          : t('pages.hr.attendance.daily.no'),
    },
    {
      title: t('pages.hr.attendance.review.columns.flag'),
      key: 'flag',
      width: 220,
      render: (_: unknown, row: AttendanceDailyLog) => (
        <Tag color={attendanceFlagTagColor(row)}>
          {formatAttendanceDayFlag(row)}
        </Tag>
      ),
    },
  ];

  return (
    <Table<AttendanceDailyLog>
      rowKey="id"
      size="small"
      className="erp-data-table"
      pagination={false}
      columns={columns}
      dataSource={logs}
      scroll={{ x: 900 }}
      rowClassName={(row) => dailyRowClassName(row)}
    />
  );
}

/**
 * Year attendance summary, monthly breakdown, and expandable daily logs.
 */
export default function EmployeeAttendanceProfileSection({
  employeeId,
  isOwnProfile,
  initialMonth,
  initialYear,
  contractPeriod: contractPeriodProp,
  contractPeriods: contractPeriodsProp,
  contractPeriodLoading: contractPeriodLoadingProp,
  onContractPeriodChange,
  hidePeriodControl = false,
}: EmployeeAttendanceProfileSectionProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(initialYear ?? currentYear);
  const [expandedKeys, setExpandedKeys] = useState<readonly React.Key[]>([]);
  const [showFieldMovementForm, setShowFieldMovementForm] = useState(false);
  const [bannerMonth, setBannerMonth] = useState<number | null>(
    initialMonth && initialMonth >= 1 && initialMonth <= 12
      ? initialMonth
      : null,
  );

  const localPeriod = useProfileContractPeriod({
    mode: isOwnProfile ? 'self' : 'employee',
    employeeId,
    enabled: Boolean(employeeId) && contractPeriodProp === undefined,
  });
  const selectedPeriod =
    contractPeriodProp !== undefined
      ? contractPeriodProp
      : localPeriod.selected;
  const periodOptions = contractPeriodsProp ?? localPeriod.periods;
  const periodsLoading =
    contractPeriodLoadingProp ?? localPeriod.isLoading;

  const yearsInPeriod = useMemo(
    () =>
      selectedPeriod
        ? calendarYearsInContractPeriod(selectedPeriod)
        : [currentYear],
    [selectedPeriod, currentYear],
  );

  useEffect(() => {
    if (yearsInPeriod.length === 0) {
      return;
    }
    if (yearsInPeriod.includes(year)) {
      return;
    }
    const preferred = yearsInPeriod.includes(currentYear)
      ? currentYear
      : yearsInPeriod[yearsInPeriod.length - 1]!;
    setYear(preferred);
  }, [yearsInPeriod, year, currentYear]);

  const myQuery = useMyAttendance(year, isOwnProfile);
  const employeeQuery = useEmployeeAttendance(
    employeeId,
    year,
    !isOwnProfile && Boolean(employeeId),
  );

  const query = isOwnProfile ? myQuery : employeeQuery;
  const loading = query.isLoading || periodsLoading;
  const error = query.isError;
  const data = query.data ?? null;

  const records = useMemo((): AttendanceYearRecord[] => {
    const rows = data?.records ?? [];
    const filtered =
      selectedPeriod != null
        ? rows.filter((row) =>
            monthOverlapsContractPeriod(year, row.month, selectedPeriod),
          )
        : rows;
    return [...filtered].sort((a, b) => a.month - b.month);
  }, [data?.records, selectedPeriod, year]);

  useEffect(() => {
    if (!isOwnProfile || bannerMonth != null || records.length === 0) {
      return;
    }
    const withFlags = [...records]
      .filter((row) => row.flaggedDays > row.resolvedDays)
      .sort((a, b) => b.month - a.month);
    if (withFlags[0]) {
      setBannerMonth(withFlags[0].month);
    }
  }, [isOwnProfile, bannerMonth, records]);

  const flaggedQuery = useMyFlaggedDays(
    bannerMonth ?? 0,
    year,
    isOwnProfile && bannerMonth != null,
  );
  const flaggedDays: FlaggedDay[] = flaggedQuery.data?.flaggedDays ?? [];
  const monthName =
    bannerMonth != null
      ? t(`hr.months.${bannerMonth}`)
      : '';

  const columns: ColumnsType<AttendanceYearRecord> = useMemo(
    () => [
      {
        title: t('hr.table.month'),
        key: 'month',
        width: 120,
        render: (_: unknown, row: AttendanceYearRecord) => (
          <span className="erp-users-cell-strong">
            {row.monthName || t(`hr.months.${row.month}`)}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.scheduledDays'),
        dataIndex: 'scheduledDays',
        key: 'scheduledDays',
        width: 110,
        align: 'right',
        render: (value: number) => (
          <span className="tabular-nums">{formatNumber(value)}</span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.presentDays'),
        dataIndex: 'presentDays',
        key: 'presentDays',
        width: 100,
        align: 'right',
        render: (value: number) => (
          <span className="tabular-nums">{formatNumber(value)}</span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.lateDays'),
        dataIndex: 'lateDays',
        key: 'lateDays',
        width: 100,
        align: 'right',
        render: (value: number) => (
          <span
            className="tabular-nums"
            style={{ color: value > 0 ? '#ba7517' : undefined }}
          >
            {value}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.absentDays'),
        dataIndex: 'absentDays',
        key: 'absentDays',
        width: 110,
        align: 'right',
        render: (value: number) => (
          <span
            className="tabular-nums"
            style={{ color: value > 0 ? '#d32f2f' : undefined }}
          >
            {formatNumber(value)}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.payableHours'),
        dataIndex: 'payableHours',
        key: 'payableHours',
        width: 110,
        align: 'right',
        responsive: ['lg'],
        render: (value: number) => (
          <span className="tabular-nums">{formatNumber(value)}</span>
        ),
      },
    ],
    [t],
  );

  const periodControl = (
    <div className="flex flex-wrap items-center gap-3">
      {hidePeriodControl ? null : (
        <ProfileContractPeriodSelect
          periods={periodOptions}
          value={selectedPeriod?.id ?? null}
          loading={periodsLoading}
          onChange={(id) => {
            if (onContractPeriodChange) {
              onContractPeriodChange(id);
            } else {
              localPeriod.setSelectedId(id);
            }
          }}
        />
      )}
      {yearsInPeriod.length > 1 ? (
        <div className="erp-leave-year-control">
          <span className="erp-leave-year-label">{t('hr.table.year')}</span>
          <Select
            size="small"
            className="min-w-[96px]"
            value={year}
            options={yearsInPeriod.map((value) => ({
              value,
              label: String(value),
            }))}
            onChange={(value: number) => {
              setYear(value);
            }}
          />
        </div>
      ) : null}
    </div>
  );

  const emptyState = (
    <div className="erp-per-diem-empty">
      <div className="erp-per-diem-empty-icon">
        <CalendarOutlined />
      </div>
      <p className="erp-per-diem-empty-title">
        {t('pages.hr.attendance.profileEmptyTitle', { year })}
      </p>
      <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
        {t('pages.hr.attendance.profileEmptyHint')}
      </p>
    </div>
  );

  if (!isOwnProfile && !employeeId) {
    return null;
  }

  const summary = data?.summary;
  const totalPayableHours =
    summary?.totalPayableHours ??
    records.reduce((sum, row) => sum + Number(row.payableHours ?? 0), 0);

  return (
    <div className="erp-leave-profile erp-attendance-profile">
      {isOwnProfile && flaggedDays.length > 0 && bannerMonth != null ? (
        <div className="erp-notice erp-notice--warning mb-4">
          <div className="erp-notice-chip">⚠️</div>
          <div className="erp-notice-body">
            <p className="erp-notice-title">
              You have {flaggedDays.length} day(s) requiring explanation for{' '}
              {monthName} {year}
            </p>
            <p className="erp-notice-description">
              HR has processed your attendance. Please submit a Field Movement /
              Early Departure log to explain these days.
            </p>
            <div className="erp-notice-action">
              <Button
                type="primary"
                size="small"
                data-shot="profile-field-movement"
                onClick={() => {
                  setShowFieldMovementForm(true);
                  void flaggedQuery.refetch();
                }}
              >
                Submit Explanation
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <AttendanceProfileSection
        title={t('pages.hr.attendance.profileYearTitle')}
        action={periodControl}
      >
        {error ? (
          <div className="erp-notice erp-notice--error">
            <span>{t('pages.hr.attendance.profileLoadError')}</span>
          </div>
        ) : loading ? (
          <div className="erp-leave-balance-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <article key={index} className="erp-leave-balance-card">
                <Skeleton.Input active block style={{ height: 72 }} />
              </article>
            ))}
          </div>
        ) : !summary || records.length === 0 ? (
          emptyState
        ) : (
          <div className="erp-leave-balance-grid">
            <StatTile
              label={t('pages.hr.attendance.stats.totalPayableHours')}
              value={formatNumber(totalPayableHours)}
              accent="#0F6E56"
            />
            <StatTile
              label={t('pages.hr.attendance.profilePresentDays')}
              value={`${formatNumber(summary.totalPresentDays)}`}
              accent="#1d9e75"
              meta={t('pages.hr.attendance.profileDaysUnit')}
            />
            <StatTile
              label={t('pages.hr.attendance.stats.totalAbsent')}
              value={`${formatNumber(summary.totalAbsentDays)}`}
              accent={summary.totalAbsentDays > 0 ? '#d32f2f' : '#94a3b8'}
              meta={t('pages.hr.attendance.profileDaysUnit')}
            />
            <StatTile
              label={t('pages.hr.attendance.stats.totalLate')}
              value={`${summary.totalLateDays}`}
              accent={summary.totalLateDays > 0 ? '#ba7517' : '#94a3b8'}
              meta={t('pages.hr.attendance.profileTimesUnit')}
            />
          </div>
        )}
      </AttendanceProfileSection>

      {!error && (loading || records.length > 0) ? (
        <AttendanceProfileSection
          title={t('pages.hr.attendance.profileMonthlyTitle')}
          bodyClassName="erp-employee-section-body--flush"
        >
          {loading ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton.Input active block style={{ height: 36 }} />
              <Skeleton.Input active block style={{ height: 36 }} />
              <Skeleton.Input active block style={{ height: 36 }} />
            </div>
          ) : (
            <Table<AttendanceYearRecord>
              rowKey="id"
              size="small"
              className="erp-data-table erp-pro-table erp-users-table"
              pagination={false}
              columns={columns}
              dataSource={records}
              scroll={{ x: 'max-content' }}
              expandable={{
                expandedRowKeys: expandedKeys,
                onExpandedRowsChange: setExpandedKeys,
                expandedRowRender: (row) => (
                  <div className="p-3">
                    <p className="mb-2 text-[12px] font-medium text-[#6B7280]">
                      {t('pages.hr.attendance.daily.title', {
                        month: row.monthName || t(`hr.months.${row.month}`),
                        year: row.year,
                      })}
                    </p>
                    <DailyLogsTable logs={row.dailyLogs ?? []} t={t} />
                  </div>
                ),
                rowExpandable: (row) => (row.dailyLogs?.length ?? 0) > 0,
              }}
            />
          )}
        </AttendanceProfileSection>
      ) : null}

      {isOwnProfile && bannerMonth != null ? (
        <FieldMovementForm
          open={showFieldMovementForm}
          onClose={() => setShowFieldMovementForm(false)}
          onSuccess={() => {
            void flaggedQuery.refetch();
            void myQuery.refetch();
          }}
          employeeId={employeeId}
          month={bannerMonth}
          year={year}
          flaggedDays={flaggedDays}
        />
      ) : null}
    </div>
  );
}
