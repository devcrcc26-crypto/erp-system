'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Drawer } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import EmployeePerDiemRatesSection from '@/components/modules/hr/per-diem/EmployeePerDiemRatesSection';
import DataTable from '@/components/ui/DataTable/DataTable';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { EmployeePerDiemRateListItem } from '@/lib/api/per-diem.types';
import {
  PER_DIEM_CATEGORY_FIELDS,
  PER_DIEM_DESTINATION_CATEGORIES,
} from '@/lib/constants/per-diem-destination-categories';
import { useEmployeePerDiemRatesList } from '@/lib/query/per-diem';
import { formatCurrencyAmount } from '@/lib/utils/expense-claim-display';
import { formatUserName } from '@/lib/utils/user-display';

function toRateNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * HR table of all employees' per diem destination rates with inline edit drawer.
 */
export default function EmployeePerDiemRatesListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editingEmployeeName, setEditingEmployeeName] = useState('');

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      sortBy: 'lastName',
      sortOrder: 'asc' as const,
    }),
    [params, search],
  );

  const listQuery = useEmployeePerDiemRatesList(listParams, canViewHr);

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const categoryColumns = useMemo(
    () =>
      PER_DIEM_DESTINATION_CATEGORIES.map((category) => {
        const { rate, active, labelKey } = PER_DIEM_CATEGORY_FIELDS[category];
        return {
          title: t(labelKey),
          key: category,
          width: 120,
          align: 'right' as const,
          render: (_: unknown, row: EmployeePerDiemRateListItem) => {
            const rateRow = row.rate;
            if (!rateRow) {
              return '—';
            }
            const amount = toRateNumber(rateRow[rate]);
            const isActive = rateRow[active];
            if (amount == null) {
              return '—';
            }
            return (
              <span
                className={isActive ? undefined : 'text-[var(--color-text-tertiary)]'}
                title={isActive ? undefined : t('hr.table.inactiveCategory')}
              >
                {formatCurrencyAmount(amount, rateRow.currency)}
              </span>
            );
          },
        } satisfies ColumnsType<EmployeePerDiemRateListItem>[number];
      }),
    [t],
  );

  const columns: ColumnsType<EmployeePerDiemRateListItem> = useMemo(
    () => [
      {
        title: t('hr.table.employee'),
        key: 'employee',
        fixed: 'left',
        width: 200,
        render: (_: unknown, row: EmployeePerDiemRateListItem) => (
          <button
            type="button"
            className="border-0 bg-transparent p-0 text-left text-[var(--color-primary)] hover:underline"
            onClick={() =>
              router.push(`/users/${row.employeeId}?tab=perDiem`)
            }
          >
            {formatUserName(row.employee)}
          </button>
        ),
      },
      {
        title: t('common.department'),
        key: 'department',
        width: 160,
        render: (_: unknown, row: EmployeePerDiemRateListItem) =>
          row.employee.department?.name ?? '—',
      },
      {
        title: t('hr.form.currency'),
        key: 'currency',
        width: 90,
        render: (_: unknown, row: EmployeePerDiemRateListItem) =>
          row.rate?.currency ?? '—',
      },
      ...categoryColumns,
      {
        title: t('common.actions'),
        key: 'actions',
        fixed: 'right',
        width: 100,
        render: (_: unknown, row: EmployeePerDiemRateListItem) => (
          <Button
            type="link"
            className="px-0"
            onClick={() => {
              setEditingEmployeeId(row.employeeId);
              setEditingEmployeeName(formatUserName(row.employee));
            }}
          >
            {t('common.update')}
          </Button>
        ),
      },
    ],
    [categoryColumns, router, t],
  );

  if (!canViewHr) {
    return (
      <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div>
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('hr.messages.employeePerDiemRatesLoadFailed')
          }
        />
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
        <ListSearchInput
          committedValue={search}
          onCommit={(value) => {
            setSearch(value);
            resetPage();
          }}
          placeholder={t('hr.placeholder.searchEmployeePerDiemRates')}
        />
        <TableUpdatingIndicator active={listQuery.isFetching} />
      </div>

      <DataTable
        rowKey="employeeId"
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1400 }}
        locale={{
          emptyText: (
            <TableEmptyState
              title={t('hr.empty.employeePerDiemRates')}
              description={t('hr.empty.employeePerDiemRatesDescription')}
            />
          ),
        }}
        pagination={bindMeta(meta)}
      />

      <Drawer
        open={editingEmployeeId != null}
        title={t('hr.dialog.editEmployeePerDiemRates', {
          name: editingEmployeeName,
        })}
        width={720}
        destroyOnHidden
        onClose={() => {
          setEditingEmployeeId(null);
          setEditingEmployeeName('');
        }}
      >
        {editingEmployeeId ? (
          <EmployeePerDiemRatesSection
            employeeId={editingEmployeeId}
            editable
          />
        ) : null}
      </Drawer>
    </div>
  );
}
