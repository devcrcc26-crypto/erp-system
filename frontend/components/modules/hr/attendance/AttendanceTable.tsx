'use client';

import { useMemo } from 'react';
import { Avatar, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import type { AttendanceRecord } from '@/lib/api/attendance.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { formatUserName } from '@/lib/utils/user-display';

const AVATAR_COLORS = [
  '#F47B20',
  '#1B2B4B',
  '#185FA5',
  '#639922',
  '#BA7517',
  '#7F77DD',
  '#D32F2F',
  '#0F6E56',
] as const;

export interface AttendanceTableProps {
  /** Full filtered list — table sorts then paginates locally. */
  records: AttendanceRecord[];
  loading: boolean;
  pagination: {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number, pageSize: number) => void;
  };
  emptyText?: React.ReactNode;
}

function initialsOf(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
}

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function rateColor(rate: number | null): string {
  if (rate == null) {
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

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/**
 * Attendance records table — schedule-based daily recalculation columns.
 */
export default function AttendanceTable({
  records,
  loading,
  pagination,
  emptyText,
}: AttendanceTableProps): React.ReactNode {
  const { t } = useEpcTranslation();

  const columns: ColumnsType<AttendanceRecord> = useMemo(
    () => [
      {
        title: t('hr.table.employee'),
        key: 'employee',
        width: 240,
        fixed: 'left',
        sorter: (a, b) =>
          compareText(formatUserName(a.employee), formatUserName(b.employee)),
        render: (_: unknown, row: AttendanceRecord) => {
          const name = formatUserName(row.employee);
          const erpId = row.employee.employeeId?.trim() || '—';
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar
                size={32}
                style={{
                  backgroundColor: avatarColor(row.employee.id),
                  flexShrink: 0,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {initialsOf(row.employee.firstName, row.employee.lastName)}
              </Avatar>
              <div className="min-w-0">
                <p className="erp-users-cell-strong m-0 truncate">{name}</p>
                <span className="erp-users-id-chip">{erpId}</span>
              </div>
            </div>
          );
        },
      },
      {
        title: t('hr.table.department'),
        key: 'department',
        width: 140,
        responsive: ['md'],
        sorter: (a, b) =>
          compareText(
            a.employee.department?.name?.trim() ?? '',
            b.employee.department?.name?.trim() ?? '',
          ),
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-users-cell-sub">
            {row.employee.department?.name?.trim() || '—'}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.scheduledDays'),
        key: 'scheduledDays',
        width: 120,
        align: 'right',
        sorter: (a, b) => toNumber(a.scheduledDays) - toNumber(b.scheduledDays),
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-users-cell-sub">
            {formatNumber(row.scheduledDays)}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.presentDays'),
        key: 'presentDays',
        width: 110,
        align: 'right',
        sorter: (a, b) => toNumber(a.presentDays) - toNumber(b.presentDays),
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-users-cell-sub">
            {formatNumber(row.presentDays)}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.absentDays'),
        key: 'absentDays',
        width: 110,
        align: 'right',
        sorter: (a, b) => toNumber(a.absentDays) - toNumber(b.absentDays),
        render: (_: unknown, row: AttendanceRecord) => {
          const absent = Number(row.absentDays);
          return (
            <span
              className="erp-users-cell-sub"
              style={
                absent > 0 ? { color: '#D32F2F', fontWeight: 600 } : undefined
              }
            >
              {formatNumber(row.absentDays)}
            </span>
          );
        },
      },
      {
        title: t('pages.hr.attendance.columns.attendanceRate'),
        key: 'attendanceRate',
        width: 120,
        align: 'center',
        sorter: (a, b) => {
          const left = a.attendanceRate;
          const right = b.attendanceRate;
          if (left == null && right == null) {
            return 0;
          }
          if (left == null) {
            return 1;
          }
          if (right == null) {
            return -1;
          }
          return left - right;
        },
        render: (_: unknown, row: AttendanceRecord) =>
          row.attendanceRate == null ? (
            <span className="erp-users-cell-sub">—</span>
          ) : (
            <Tag color={rateColor(row.attendanceRate)}>
              {row.attendanceRate}%
            </Tag>
          ),
      },
      {
        title: t('pages.hr.attendance.columns.lateDays'),
        key: 'lateDays',
        width: 90,
        align: 'right',
        sorter: (a, b) => a.lateDays - b.lateDays,
        render: (_: unknown, row: AttendanceRecord) => (
          <span
            className="erp-users-cell-sub"
            style={
              row.lateDays > 0 ? { color: '#BA7517', fontWeight: 600 } : undefined
            }
          >
            {row.lateDays}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.missingClockOut'),
        key: 'missingClockOutDays',
        width: 130,
        align: 'right',
        responsive: ['lg'],
        sorter: (a, b) => a.missingClockOutDays - b.missingClockOutDays,
        render: (_: unknown, row: AttendanceRecord) => (
          <span
            className="erp-users-cell-sub"
            style={
              row.missingClockOutDays > 0
                ? { color: '#BA7517', fontWeight: 600 }
                : undefined
            }
          >
            {row.missingClockOutDays}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.payableHours'),
        key: 'payableHours',
        width: 110,
        align: 'right',
        responsive: ['xl'],
        sorter: (a, b) => toNumber(a.payableHours) - toNumber(b.payableHours),
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-users-cell-sub">
            {formatNumber(row.payableHours)}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <DataTable<AttendanceRecord>
      className="erp-data-table erp-pro-table"
      rowKey="id"
      columns={columns}
      dataSource={records}
      loading={loading}
      scroll={{ x: 1200 }}
      locale={emptyText ? { emptyText } : undefined}
      pagination={{
        current: pagination.current,
        pageSize: pagination.pageSize,
        total: pagination.total,
        showSizeChanger: true,
        onChange: pagination.onChange,
      }}
    />
  );
}
