'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Input, Spin, Tooltip } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  PerDiemBalanceDirection,
  PerDiemSettlementListItem,
  PerDiemStatus,
} from '@/lib/api/per-diem.types';
import type { PaginationMeta } from '@/lib/api/types';
import { usePerDiemSettlementsAll } from '@/lib/query/per-diem';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import {
  formatPerDiemEmployeeName,
  formatPerDiemStatus,
  perDiemStatusVariant,
} from '@/lib/utils/per-diem-display';

/**
 * Settlements tab on the per diem list.
 */
export default function PerDiemSettlementsList(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const listQuery = usePerDiemSettlementsAll(true);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = listQuery.data ?? [];
    if (!needle) {
      return rows;
    }
    return rows.filter((row) => {
      const employee = formatPerDiemEmployeeName(row.employee).toLowerCase();
      return (
        row.requestNumber.toLowerCase().includes(needle) ||
        row.destination.toLowerCase().includes(needle) ||
        employee.includes(needle)
      );
    });
  }, [listQuery.data, search]);

  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const rows = filtered.slice((page - 1) * limit, page * limit);
  const meta: PaginationMeta = {
    total: filtered.length,
    page,
    limit,
    pages: Math.max(1, Math.ceil(filtered.length / limit) || 1),
  };

  const columns: ColumnsType<PerDiemSettlementListItem> = useMemo(
    () => [
      {
        title: t('hr.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 130,
        render: (value: string) => <span className="erp-users-id-chip">{value}</span>,
      },
      ...(canViewHr
        ? [
            {
              title: t('hr.table.employee'),
              key: 'employee',
              render: (_: unknown, row: PerDiemSettlementListItem) =>
                formatPerDiemEmployeeName(row.employee),
            },
          ]
        : []),
      {
        title: t('hr.table.destination'),
        dataIndex: 'destination',
        key: 'destination',
      },
      {
        title: t('pages.hr.perDiemSettlement.balance'),
        key: 'balance',
        align: 'right' as const,
        render: (_: unknown, row: PerDiemSettlementListItem) => (
          <span>
            {formatEtbAmount(row.balance)}
            <span className="erp-users-cell-sub ms-1">
              {balanceLabel(row.balanceDirection, t)}
            </span>
          </span>
        ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: PerDiemStatus) => (
          <StatusBadge
            label={formatPerDiemStatus(value, t)}
            variant={perDiemStatusVariant(value)}
          />
        ),
      },
    ],
    [canViewHr, t],
  );

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
        <Spin />
      </div>
    );
  }

  return (
    <div className="erp-pro-card overflow-hidden">
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          className="m-4"
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('hr.messages.failedToLoadPerDiemSettlements')
          }
        />
      ) : null}
      <div className="erp-users-toolbar flex flex-wrap items-center justify-between gap-2">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t('pages.hr.perDiemSettlement.searchPlaceholder')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            resetPage();
          }}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Tooltip title={t('common.refresh')}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={() => void listQuery.refetch()}
            />
          </Tooltip>
          <Button type="primary" onClick={() => router.push('/approvals/new/per-diem-settlement')}>
            {t('pages.hr.perDiemSettlement.new')}
          </Button>
        </div>
      </div>
      <DataTable
        rowKey="id"
        columns={columns}
        dataSource={rows}
        pagination={bindMeta(meta)}
        onRow={(record) => ({
          onClick: () => router.push(`/hr/per-diem/settlements/${record.id}`),
          style: { cursor: 'pointer' },
        })}
      />
    </div>
  );
}

function balanceLabel(
  direction: PerDiemBalanceDirection,
  t: (key: string) => string,
): string {
  if (direction === 'TO_COMPANY') {
    return t('pages.hr.perDiemSettlement.favorCompanyShort');
  }
  if (direction === 'TO_EMPLOYEE') {
    return t('pages.hr.perDiemSettlement.favorEmployeeShort');
  }
  return t('pages.hr.perDiemSettlement.balanceNone');
}
