'use client';

import { useMemo, useState } from 'react';
import { Alert, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { History } from 'lucide-react';
import DataTable from '@/components/ui/DataTable/DataTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  LeaveBalanceEntry,
  LeaveBalanceEntryKind,
  LeaveType,
} from '@/lib/api/leave.types';
import { useLeaveBalanceLedger } from '@/lib/query/leave';
import { formatLeaveType } from '@/lib/utils/leave-display';
import { formatProjectDate } from '@/lib/utils/project-display';

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
  const [page, setPage] = useState(1);
  const ledgerQuery = useLeaveBalanceLedger(employeeId);
  const current = ledgerQuery.data?.currentLeaveYear;
  const entries = ledgerQuery.data?.entries ?? [];

  const columns: ColumnsType<LeaveBalanceEntry> = useMemo(
    () => [
      {
        title: t(`${KEY}.colWhen`),
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 120,
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t(`${KEY}.colLeaveYear`),
        key: 'leaveYear',
        width: 90,
        responsive: ['md'],
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
        render: (value: LeaveType) => formatLeaveType(value, t),
      },
      {
        title: t(`${KEY}.colKind`),
        dataIndex: 'kind',
        key: 'kind',
        width: 140,
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
        render: (value: string | null) => value ?? '-',
      },
      {
        title: t(`${KEY}.colBy`),
        key: 'by',
        width: 180,
        responsive: ['md'],
        render: (_: unknown, row) => {
          const name = row.createdBy?.name?.trim();
          return name && name.length > 0 ? name : t(`${KEY}.system`);
        },
      },
    ],
    [t],
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
            dataSource={entries}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: entries.length,
              showSizeChanger: false,
              hideOnSinglePage: true,
              onChange: setPage,
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
