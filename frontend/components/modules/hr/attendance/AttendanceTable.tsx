'use client';

import { useMemo } from 'react';
import { Avatar, Button, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CalendarOutlined } from '@ant-design/icons';
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
  onViewDailyLogs?: (record: AttendanceRecord) => void;
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

function mutedOrValue(
  value: number,
  activeColor: string,
  formatter: (n: number) => string = String,
): React.ReactNode {
  if (value <= 0) {
    return <span style={{ color: '#94a3b8' }}>—</span>;
  }
  return (
    <span style={{ color: activeColor, fontWeight: 600 }}>
      {formatter(value)}
    </span>
  );
}

/**
 * Attendance records table — schedule-based daily recalculation columns.
 */
export default function AttendanceTable({
  records,
  loading,
  pagination,
  emptyText,
  onViewDailyLogs,
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
        render: (_: unknown, row: AttendanceRecord) =>
          mutedOrValue(toNumber(row.absentDays), '#D32F2F', formatNumber),
      },
      {
        title: t('pages.hr.attendance.columns.lateDays'),
        key: 'lateDays',
        width: 90,
        align: 'right',
        sorter: (a, b) => a.lateDays - b.lateDays,
        render: (_: unknown, row: AttendanceRecord) =>
          mutedOrValue(row.lateDays, '#BA7517'),
      },
      {
        title: t('pages.hr.attendance.columns.missingClockOut'),
        key: 'missingClockOutDays',
        width: 140,
        align: 'right',
        sorter: (a, b) => a.missingClockOutDays - b.missingClockOutDays,
        render: (_: unknown, row: AttendanceRecord) =>
          mutedOrValue(row.missingClockOutDays, '#BA7517'),
      },
      {
        title: t('pages.hr.attendance.columns.payableHours'),
        key: 'payableHours',
        width: 120,
        align: 'right',
        sorter: (a, b) => toNumber(a.payableHours) - toNumber(b.payableHours),
        render: (_: unknown, row: AttendanceRecord) => (
          <span style={{ color: '#0F6E56', fontWeight: 600 }}>
            {formatNumber(row.payableHours)}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.review.columns.flaggedDays'),
        key: 'flaggedDays',
        width: 130,
        align: 'center',
        sorter: (a, b) => a.flaggedDays - b.flaggedDays,
        render: (_: unknown, row: AttendanceRecord) => {
          const flagged = row.flaggedDays ?? 0;
          if (flagged > 0) {
            return (
              <Tag color="warning" className="erp-attendance-flag-badge m-0">
                {flagged} flag{flagged !== 1 ? 's' : ''}
              </Tag>
            );
          }
          return (
            <Tag color="success" className="erp-attendance-flag-badge m-0">
              ✓ No flags
            </Tag>
          );
        },
      },
      ...(onViewDailyLogs
        ? [
            {
              title: t('common.actions'),
              key: 'actions',
              width: 72,
              align: 'center' as const,
              fixed: 'right' as const,
              render: (_: unknown, row: AttendanceRecord) => (
                <Tooltip title={t('pages.hr.attendance.review.viewDailyLogs')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<CalendarOutlined />}
                    onClick={() => onViewDailyLogs(row)}
                    aria-label={t('pages.hr.attendance.review.viewDailyLogs')}
                  />
                </Tooltip>
              ),
            },
          ]
        : []),
    ],
    [onViewDailyLogs, t],
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
