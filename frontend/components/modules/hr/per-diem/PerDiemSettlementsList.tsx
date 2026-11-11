'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useMemo, useState } from 'react';
import { Alert, Button, Grid, Input, Spin, Tooltip } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import HrPersonCell from '@/components/modules/hr/shared/HrPersonCell';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useCanEditHr, useCanViewHr } from '@/hooks/use-auth-capabilities';
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
  const canEditHr = useCanEditHr();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
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
              width: 240,
              render: (_: unknown, row: PerDiemSettlementListItem) => (
                <HrPersonCell
                  person={row.employee}
                  name={formatPerDiemEmployeeName(row.employee)}
                />
              ),
            },
          ]
        : []),
      // No width: takes the spare space so the table spans the card.
      {
        title: t('hr.table.destination'),
        dataIndex: 'destination',
        key: 'destination',
        ellipsis: true,
        render: (value: string) => (
          <span className="erp-users-cell-strong">{value}</span>
        ),
      },
      {
        title: t('pages.hr.perDiemSettlement.balance'),
        key: 'balance',
        width: 200,
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
      <div className="erp-pro-card flex justify-center p-12">
        <Spin />
      </div>
    );
  }

  return (
    <div className="erp-pro-card erp-employees-list-card overflow-hidden">
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
      <div className="erp-pro-card-toolbar erp-users-toolbar">
        <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
          <h3 className="erp-pro-card-toolbar-title m-0">
            {t('pages.hr.perDiem.settlementsTab')}
          </h3>
          <span className="erp-users-count-pill">
            {meta.total.toLocaleString()}
          </span>
        </div>
        <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
          <Tooltip title={t('common.refresh')}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={listQuery.isFetching && !listQuery.isLoading}
              onClick={() => void listQuery.refetch()}
              aria-label={t('common.refresh')}
            />
          </Tooltip>
          {canEditHr ? (
            <Button
              type="primary"
              onClick={() => router.push('/approvals/new/per-diem-settlement')}
            >
              {t('pages.hr.perDiemSettlement.new')}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="erp-users-filter-bar">
        <Input
          allowClear
          prefix={<SearchOutlined className="erp-users-search-icon" />}
          placeholder={t('pages.hr.perDiemSettlement.searchPlaceholder')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            resetPage();
          }}
          className="erp-users-search-input min-w-0"
          aria-label={t('pages.hr.perDiemSettlement.searchPlaceholder')}
        />
      </div>
      <div className="erp-pro-table-card-body">
        <DataTable
          className="erp-pro-table erp-users-table"
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={bindMeta(meta)}
          scroll={{ x: isNarrow ? 520 : isCompact ? 720 : 900 }}
          onRow={(record) => ({
            onClick: () => {
              if (record.settlementKind === 'REQUEST' && record.requestId) {
                router.push(`/hr/per-diem/${record.requestId}`);
                return;
              }
              router.push(`/hr/per-diem/settlements/${record.id}`);
            },
            style: { cursor: 'pointer' },
          })}
        />
      </div>
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
