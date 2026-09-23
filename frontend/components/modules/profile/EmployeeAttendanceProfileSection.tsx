'use client';

import { useMemo, useState } from 'react';
import { Badge, InputNumber, Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CalendarOutlined } from '@ant-design/icons';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { AttendanceRecord } from '@/lib/api/attendance.types';
import {
  useEmployeeAttendance,
  useMyAttendance,
} from '@/lib/query/attendance';

type AttendanceYearRecord = AttendanceRecord & { monthName: string };

export interface EmployeeAttendanceProfileSectionProps {
  employeeId: string;
  /** When true, calls GET /hr/attendance/me; otherwise the employee year endpoint. */
  isOwnProfile: boolean;
  /** Reserved for future tenant-scoped UI; company is resolved from the JWT. */
  companyId?: string;
}

type RateBadgeStatus = 'success' | 'warning' | 'error' | 'default';

function getAttendanceRateColor(rate: number | null): RateBadgeStatus {
  if (rate === null) {
    return 'default';
  }
  if (rate >= 90) {
    return 'success';
  }
  if (rate >= 75) {
    return 'warning';
  }
  return 'error';
}

function rateAccent(rate: number | null): string {
  if (rate === null) {
    return '#94a3b8';
  }
  if (rate >= 90) {
    return '#1d9e75';
  }
  if (rate >= 75) {
    return '#ba7517';
  }
  return '#d32f2f';
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

/**
 * Year attendance summary and monthly breakdown for My Profile or HR employee detail.
 */
export default function EmployeeAttendanceProfileSection({
  employeeId,
  isOwnProfile,
}: EmployeeAttendanceProfileSectionProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const myQuery = useMyAttendance(year, isOwnProfile);
  const employeeQuery = useEmployeeAttendance(
    employeeId,
    year,
    !isOwnProfile && Boolean(employeeId),
  );

  const query = isOwnProfile ? myQuery : employeeQuery;
  const loading = query.isLoading;
  const error = query.isError;
  const data = query.data ?? null;

  const records = useMemo((): AttendanceYearRecord[] => {
    const rows = data?.records ?? [];
    return [...rows].sort((a, b) => a.month - b.month);
  }, [data?.records]);

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
        title: t('pages.hr.attendance.columns.expectedDays'),
        dataIndex: 'expectedDays',
        key: 'expectedDays',
        width: 110,
        align: 'right',
        render: (value: number) => (
          <span className="tabular-nums">{value}</span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.actualDays'),
        dataIndex: 'actualDays',
        key: 'actualDays',
        width: 100,
        align: 'right',
        render: (value: number) => (
          <span className="tabular-nums">{value}</span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.attendanceRate'),
        dataIndex: 'attendanceRate',
        key: 'attendanceRate',
        width: 120,
        render: (value: number | null) => (
          <Badge
            status={getAttendanceRateColor(value)}
            text={value !== null ? `${value}%` : '—'}
          />
        ),
      },
      {
        title: t('pages.hr.attendance.columns.lateCount'),
        dataIndex: 'lateCount',
        key: 'lateCount',
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
        title: t('pages.hr.attendance.columns.lateMinutes'),
        dataIndex: 'lateMinutes',
        key: 'lateMinutes',
        width: 110,
        align: 'right',
        responsive: ['md'],
        render: (value: number) => (
          <span className="tabular-nums">{value}</span>
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
            {value}
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
          <span className="tabular-nums">{value}</span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.overtimePaid'),
        dataIndex: 'overtimePaidHours',
        key: 'overtimePaidHours',
        width: 120,
        align: 'right',
        responsive: ['lg'],
        render: (value: number) => (
          <span className="tabular-nums">{value}</span>
        ),
      },
    ],
    [t],
  );

  const yearControl = (
    <div className="erp-leave-year-control">
      <span className="erp-leave-year-label">{t('hr.table.year')}</span>
      <InputNumber
        min={2020}
        max={currentYear}
        value={year}
        onChange={(value) => {
          if (typeof value === 'number') {
            setYear(value);
          }
        }}
        size="small"
        className="erp-leave-year-input"
      />
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
  const avgRate = summary?.averageAttendanceRate ?? null;

  return (
    <div className="erp-leave-profile erp-attendance-profile">
      <AttendanceProfileSection
        title={t('pages.hr.attendance.profileYearTitle')}
        action={yearControl}
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
              label={t('pages.hr.attendance.stats.avgAttendance')}
              value={avgRate !== null ? `${avgRate}%` : '—'}
              accent={rateAccent(avgRate)}
            />
            <StatTile
              label={t('pages.hr.attendance.profilePresentDays')}
              value={`${summary.totalActualDays}`}
              accent="#1d9e75"
              meta={t('pages.hr.attendance.profileDaysUnit')}
            />
            <StatTile
              label={t('pages.hr.attendance.stats.totalAbsent')}
              value={`${summary.totalAbsentDays}`}
              accent={summary.totalAbsentDays > 0 ? '#d32f2f' : '#94a3b8'}
              meta={t('pages.hr.attendance.profileDaysUnit')}
            />
            <StatTile
              label={t('pages.hr.attendance.stats.totalLate')}
              value={`${summary.totalLateCount}`}
              accent={summary.totalLateCount > 0 ? '#ba7517' : '#94a3b8'}
              meta={t('pages.hr.attendance.profileTimesUnit')}
            />
          </div>
        )}
      </AttendanceProfileSection>

      {!error && (loading || records.length > 0) ? (
        <AttendanceProfileSection
          title={t('pages.hr.attendance.profileMonthlyTitle')}
          bodyClassName="!p-0"
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
            />
          )}
        </AttendanceProfileSection>
      ) : null}
    </div>
  );
}
