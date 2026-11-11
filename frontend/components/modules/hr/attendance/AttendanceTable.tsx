'use client';

import { useMemo } from 'react';
import { Avatar, Button, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CalendarOutlined } from '@ant-design/icons';
import DataTable from '@/components/ui/DataTable/DataTable';
import type { AttendanceRecord } from '@/lib/api/attendance.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useIsMdUp } from '@/hooks/useMediaQuery';
import { formatUserName } from '@/lib/utils/user-display';

const AVATAR_COLORS = [
  'var(--color-teal-400)',
  'var(--color-blue-400)',
  'var(--color-amber-400)',
  'var(--color-teal-600)',
  'var(--color-blue-800)',
  'var(--color-red-400)',
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

/**
 * Attendance records table - present / absent / leave / late / flagged + actions.
 */
export default function AttendanceTable({
  records,
  loading,
  pagination,
  emptyText,
  onViewDailyLogs,
}: AttendanceTableProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const isMdUp = useIsMdUp();

  const columns: ColumnsType<AttendanceRecord> = useMemo(
    () => [
      {
        title: t('hr.table.employee'),
        key: 'employee',
        width: isMdUp ? 260 : 160,
        fixed: isMdUp ? 'left' : undefined,
        sorter: (a, b) =>
          compareText(formatUserName(a.employee), formatUserName(b.employee)),
        render: (_: unknown, row: AttendanceRecord) => {
          const name = formatUserName(row.employee);
          const erpId = row.employee.employeeId?.trim() || '-';
          return (
            <div className="flex items-center gap-2.5">
              <Avatar
                size={36}
                className="erp-users-avatar"
                style={{
                  background: avatarColor(row.employee.id),
                  flexShrink: 0,
                }}
              >
                {initialsOf(row.employee.firstName, row.employee.lastName)}
              </Avatar>
              <div className="min-w-0">
                <div className="erp-users-name">{name}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="erp-users-id-chip">{erpId}</span>
                </div>
              </div>
            </div>
          );
        },
      },
      {
        title: t('pages.hr.attendance.columns.paidDays'),
        key: 'paidDays',
        width: 130,
        align: 'right',
        sorter: (a, b) => toNumber(a.paidDays) - toNumber(b.paidDays),
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-att-num erp-att-num--teal">
            {formatNumber(row.paidDays ?? 0)}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.presentDays'),
        key: 'presentDays',
        width: 120,
        align: 'right',
        sorter: (a, b) => toNumber(a.presentDays) - toNumber(b.presentDays),
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-att-num">{formatNumber(row.presentDays)}</span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.absentDays'),
        key: 'absentDays',
        width: 100,
        align: 'right',
        sorter: (a, b) => toNumber(a.absentDays) - toNumber(b.absentDays),
        render: (_: unknown, row: AttendanceRecord) => {
          const absent = toNumber(row.absentDays);
          if (absent === 0) {
            return <span className="erp-att-dash">-</span>;
          }
          return (
            <span className="erp-att-num erp-att-num--danger">
              {formatNumber(absent)}
            </span>
          );
        },
      },
      {
        title: t('pages.hr.attendance.columns.unpaidLeaveDays'),
        key: 'unpaidLeaveDays',
        width: 120,
        align: 'right',
        sorter: (a, b) =>
          toNumber(a.unpaidLeaveDays ?? 0) - toNumber(b.unpaidLeaveDays ?? 0),
        render: (_: unknown, row: AttendanceRecord) => {
          const unpaid = toNumber(row.unpaidLeaveDays ?? 0);
          if (unpaid === 0) {
            return <span className="erp-att-dash">-</span>;
          }
          return (
            <span className="erp-att-num erp-att-num--danger">
              {formatNumber(unpaid)}
            </span>
          );
        },
      },
      {
        title: t('pages.hr.attendance.columns.leaveDays'),
        key: 'leave',
        width: 150,
        render: (_: unknown, row: AttendanceRecord) => {
          const leaves = row.approvedLeave ?? [];
          if (leaves.length === 0) {
            return <span className="erp-att-dash">-</span>;
          }

          return (
            <div className="flex flex-col gap-0.5">
              {leaves.map((leave) => (
                <Tooltip
                  key={leave.id}
                  title={leave.periods
                    .map(
                      (period) =>
                        `${new Date(period.startDate).toLocaleDateString()} – ${new Date(period.endDate).toLocaleDateString()} (${period.days}d)`,
                    )
                    .join(', ')}
                >
                  <Tag color="green" className="m-0 text-[11px]">
                    {leave.leaveType.replace(/_/g, ' ')} · {leave.days}d
                  </Tag>
                </Tooltip>
              ))}
            </div>
          );
        },
      },
      {
        title: t('pages.hr.attendance.columns.lateDays'),
        key: 'lateDays',
        width: 100,
        align: 'right',
        sorter: (a, b) => a.lateDays - b.lateDays,
        render: (_: unknown, row: AttendanceRecord) => {
          const value = row.lateDays;
          return (
            <span
              className={
                value > 0 ? 'erp-att-num erp-att-num--warn' : 'erp-att-dash'
              }
            >
              {value > 0 ? value : '-'}
            </span>
          );
        },
      },
      {
        title: t('pages.hr.attendance.review.columns.flaggedDays'),
        key: 'flaggedDays',
        width: 140,
        align: 'center',
        sorter: (a, b) => a.flaggedDays - b.flaggedDays,
        render: (_: unknown, row: AttendanceRecord) => {
          const flagged = row.flaggedDays ?? 0;
          const resolved = row.resolvedDays ?? 0;
          if (flagged === 0) {
            return <span className="erp-att-dash">-</span>;
          }
          if (resolved === flagged) {
            return (
              <Tag color="success" className="rounded-full font-medium">
                ✓ Resolved
              </Tag>
            );
          }
          return (
            <Tag color="warning" className="rounded-full font-semibold">
              {flagged - resolved} pending
            </Tag>
          );
        },
      },
      ...(onViewDailyLogs
        ? [
            {
              title: t('common.actions'),
              key: 'actions',
              width: isMdUp ? 72 : 80,
              align: 'center' as const,
              fixed: isMdUp ? ('right' as const) : undefined,
              render: (_: unknown, row: AttendanceRecord) => (
                <div className="erp-table-row-actions flex items-center justify-center">
                  <Tooltip title={t('pages.hr.attendance.review.viewDailyLogs')}>
                    <Button
                      type="text"
                      size="small"
                      icon={<CalendarOutlined />}
                      onClick={() => onViewDailyLogs(row)}
                      aria-label={t(
                        'pages.hr.attendance.review.viewDailyLogs',
                      )}
                    />
                  </Tooltip>
                </div>
              ),
            },
          ]
        : []),
    ],
    [onViewDailyLogs, t, isMdUp],
  );

  // Keep scroll.x equal to the column total so fixed columns stay aligned.
  const scrollX = columns.reduce(
    (sum, column) => sum + (typeof column.width === 'number' ? column.width : 0),
    0,
  );

  return (
    <DataTable<AttendanceRecord>
      className="erp-data-table erp-pro-table erp-users-table"
      rowKey="id"
      columns={columns}
      dataSource={records}
      loading={loading}
      scroll={{ x: scrollX }}
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
