'use client';

import { useMemo } from 'react';
import { Alert, Tag, type TableProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { History } from 'lucide-react';
import DataTable from '@/components/ui/DataTable/DataTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useTablePagination,
  withControlledSort,
} from '@/hooks/use-table-pagination';
import type {
  LeaveBalanceEntry,
  LeaveBalanceEntryKind,
  LeaveType,
} from '@/lib/api/leave.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useLeaveBalanceLedger } from '@/lib/query/leave';
import { formatLeaveType } from '@/lib/utils/leave-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { sortLeaveBalanceEntries } from '@/lib/utils/table-sort';

const KEY = 'hr.leave.ledger';
const PAGE_SIZE = 10;

const KIND_COLORS: Record<LeaveBalanceEntryKind, string> = {
  ENTITLEMENT: 'green',
  CARRY_OVER: 'blue',
  ADJUSTMENT: 'purple',
  OPENING_BALANCE: 'cyan',
  USED: 'orange',
  EXPIRED: 'default',
};

function signed(days: number): string {
  return days > 0 ? `+${days}` : String(days);
}

/**
 * Read-only leave balance history. Edits happen on the Leave Balances tab
 * (System Administrator / GM / HR only).
 */
export default function LeaveBalanceLedgerSection({
  employeeId,
}: {
  /** Undefined = the signed-in user. */
  employeeId?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const { params, bindMeta, handleTableChange, sortBy, sortOrder } =
    useTablePagination({
      initialPageSize: PAGE_SIZE,
      initialSortBy: 'createdAt',
      initialSortOrder: 'desc',
    });
  const ledgerQuery = useLeaveBalanceLedger(employeeId);
  const current = ledgerQuery.data?.currentLeaveYear;
  const entries = ledgerQuery.data?.entries ?? [];

  const sorted = useMemo(
    () => sortLeaveBalanceEntries(entries, sortBy, sortOrder),
    [entries, sortBy, sortOrder],
  );

  const meta: PaginationMeta = useMemo(() => {
    const total = sorted.length;
    const limit = params.limit ?? PAGE_SIZE;
    const page = params.page ?? 1;
    return {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }, [sorted.length, params.limit, params.page]);

  const rows = useMemo(() => {
    const start = (meta.page - 1) * meta.limit;
    return sorted.slice(start, start + meta.limit);
  }, [sorted, meta.page, meta.limit]);

  const columns: ColumnsType<LeaveBalanceEntry> = useMemo(
    () =>
      withControlledSort<LeaveBalanceEntry>(
        [
          {
            title: t(`${KEY}.colWhen`),
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 120,
            sorter: true,
            render: (value: string) => formatProjectDate(value),
          },
          {
            title: t(`${KEY}.colLeaveYear`),
            key: 'leaveYear',
            width: 90,
            responsive: ['md'],
            sorter: true,
            render: (_: unknown, row) => {
              if (row.leaveYearLabel != null) {
                return String(row.leaveYearLabel);
              }
              const fromStart = Number(String(row.leaveYearStart).slice(0, 4));
              return Number.isFinite(fromStart) && fromStart > 0
                ? String(fromStart)
                : '—';
            },
          },
          {
            title: t(`${KEY}.colPeriod`),
            key: 'period',
            width: 200,
            responsive: ['md'],
            render: (_: unknown, row) => {
              const periods = row.requestedPeriods ?? [];
              if (periods.length === 0) {
                return '—';
              }
              return (
                <div className="flex flex-col gap-0.5">
                  {periods.map((period) => {
                    const start = formatProjectDate(period.startDate);
                    const end = formatProjectDate(period.endDate);
                    const label =
                      period.startDate === period.endDate
                        ? start
                        : `${start} – ${end}`;
                    return (
                      <span key={`${period.startDate}-${period.endDate}`}>
                        {label}
                      </span>
                    );
                  })}
                </div>
              );
            },
          },
          {
            title: t('hr.table.leaveType'),
            dataIndex: 'leaveType',
            key: 'leaveType',
            width: 110,
            sorter: true,
            render: (value: LeaveType) => formatLeaveType(value, t),
          },
          {
            title: t(`${KEY}.colKind`),
            dataIndex: 'kind',
            key: 'kind',
            width: 140,
            sorter: true,
            render: (value: LeaveBalanceEntryKind) => (
              <Tag color={KIND_COLORS[value]} className="m-0 rounded-full">
                {t(`${KEY}.kinds.${value}`)}
              </Tag>
            ),
          },
          {
            title: t(`${KEY}.colDays`),
            dataIndex: 'days',
            key: 'days',
            width: 80,
            align: 'right',
            sorter: true,
            render: (value: number) => (
              <span
                className={`tabular-nums font-semibold ${
                  value < 0 ? 'text-red-700' : 'text-emerald-700'
                }`}
              >
                {signed(value)}
              </span>
            ),
          },
          {
            title: t(`${KEY}.colReason`),
            dataIndex: 'reason',
            key: 'reason',
            sorter: true,
            render: (value: string | null) => value ?? '-',
          },
          {
            title: t(`${KEY}.colBy`),
            key: 'by',
            width: 180,
            responsive: ['md'],
            sorter: true,
            render: (_: unknown, row) => {
              const name = row.createdBy?.name?.trim();
              return name && name.length > 0 ? name : t(`${KEY}.system`);
            },
          },
        ],
        sortBy,
        sortOrder,
      ) ?? [],
    [sortBy, sortOrder, t],
  );

  return (
    <div className="erp-employee-section">
      <div className="erp-employee-section-header">
        <div className="min-w-0">
          <h3 className="erp-employee-section-title">{t(`${KEY}.title`)}</h3>
          {current ? (
            <p className="m-0 mt-0.5 text-xs text-slate-600">
              {t(`${KEY}.currentLeaveYear`, {
                start: formatProjectDate(current.start),
                end: formatProjectDate(current.end),
              })}
            </p>
          ) : null}
        </div>
      </div>
      <div className="erp-employee-section-body erp-employee-section-body--flush">
        {ledgerQuery.isError ? (
          <div className="p-4">
            <Alert type="error" showIcon title={t(`${KEY}.loadFailed`)} />
          </div>
        ) : (
          <DataTable<LeaveBalanceEntry>
            rowKey="id"
            size="small"
            className="erp-pro-table erp-users-table"
            loading={ledgerQuery.isLoading}
            columns={columns}
            dataSource={rows}
            onChange={
              handleTableChange as TableProps<LeaveBalanceEntry>['onChange']
            }
            pagination={{
              ...bindMeta(meta),
              showSizeChanger: false,
              hideOnSinglePage: true,
            }}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<History size={28} strokeWidth={1.5} />}
                  title={t(`${KEY}.empty`)}
                />
              ),
            }}
          />
        )}
      </div>
    </div>
  );
}
