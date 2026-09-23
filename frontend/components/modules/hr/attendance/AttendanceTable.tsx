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

/**
 * Attendance records table — Users chrome / Pro table pattern.
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
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-users-cell-sub">
            {row.employee.department?.name?.trim() || '—'}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.expectedDays'),
        key: 'expectedDays',
        width: 110,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-users-cell-sub">
            {formatNumber(row.expectedDays)}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.actualDays'),
        key: 'actualDays',
        width: 100,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-users-cell-sub">
            {formatNumber(row.actualDays)}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.attendanceRate'),
        key: 'attendanceRate',
        width: 120,
        align: 'center',
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
        title: t('pages.hr.attendance.columns.lateCount'),
        key: 'lateCount',
        width: 90,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => (
          <span
            className="erp-users-cell-sub"
            style={row.lateCount > 0 ? { color: '#BA7517', fontWeight: 600 } : undefined}
          >
            {row.lateCount}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.absentDays'),
        key: 'absentDays',
        width: 110,
        align: 'right',
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
        title: t('pages.hr.attendance.columns.missingClockIn'),
        key: 'missingClockIn',
        width: 120,
        align: 'right',
        responsive: ['lg'],
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-users-cell-sub">{row.missingClockIn}</span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.missingClockOut'),
        key: 'missingClockOut',
        width: 130,
        align: 'right',
        responsive: ['lg'],
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-users-cell-sub">{row.missingClockOut}</span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.payableHours'),
        key: 'payableHours',
        width: 110,
        align: 'right',
        responsive: ['xl'],
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-users-cell-sub">
            {formatNumber(row.payableHours)}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.overtimePaid'),
        key: 'overtimePaidHours',
        width: 120,
        align: 'right',
        responsive: ['xl'],
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-users-cell-sub">
            {formatNumber(row.overtimePaidHours)}
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
      scroll={{ x: 1280 }}
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
