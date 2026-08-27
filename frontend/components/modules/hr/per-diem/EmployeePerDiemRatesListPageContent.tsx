'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Spin,
  Space,
  Tooltip,
} from 'antd';
import {
  BankOutlined,
  CheckCircleOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import EmployeePerDiemRatesSection from '@/components/modules/hr/per-diem/EmployeePerDiemRatesSection';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanManageEmployeePerDiemRates } from '@/hooks/use-auth-capabilities';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { EmployeePerDiemRateListItem } from '@/lib/api/per-diem.types';
import {
  PER_DIEM_CATEGORY_FIELDS,
  PER_DIEM_DESTINATION_CATEGORIES,
} from '@/lib/constants/per-diem-destination-categories';
import { useEmployeePerDiemRatesList } from '@/lib/query/per-diem';
import { tokens } from '@/lib/theme/tokens';
import { formatCurrencyAmount } from '@/lib/utils/expense-claim-display';
import { formatUserName } from '@/lib/utils/user-display';

type SetupFilter = 'all' | 'configured' | 'pending';

function toRateNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function countActiveCategories(
  row: EmployeePerDiemRateListItem['rate'],
): number {
  if (!row) {
    return 0;
  }
  return PER_DIEM_DESTINATION_CATEGORIES.filter((category) => {
    const { active } = PER_DIEM_CATEGORY_FIELDS[category];
    return row[active];
  }).length;
}

/**
 * HR table of all employees' per diem destination rates with inline edit drawer.
 */
export default function EmployeePerDiemRatesListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canManagePerDiemRates = useCanManageEmployeePerDiemRates();
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const [search, setSearch] = useState('');
  const [setupFilter, setSetupFilter] = useState<SetupFilter>('all');
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

  const statsQuery = useEmployeePerDiemRatesList(
    {
      page: 1,
      limit: 100,
      search: search.trim() || undefined,
      sortBy: 'lastName',
      sortOrder: 'asc',
    },
    canManagePerDiemRates,
  );

  const listQuery = useEmployeePerDiemRatesList(listParams, canManagePerDiemRates);

  const allRows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;
  const totalCount = meta?.total ?? allRows.length;
  const statsRows = statsQuery.data?.data ?? [];

  const filteredRows = useMemo(() => {
    if (setupFilter === 'configured') {
      return allRows.filter((row) => row.rate != null);
    }
    if (setupFilter === 'pending') {
      return allRows.filter((row) => row.rate == null);
    }
    return allRows;
  }, [allRows, setupFilter]);

  const stats = useMemo(() => {
    const configured = statsRows.filter((row) => row.rate != null).length;
    const pending = statsRows.filter((row) => row.rate == null).length;
    const activeCategories = statsRows.reduce(
      (sum, row) => sum + countActiveCategories(row.rate),
      0,
    );
    return {
      total: statsQuery.data?.meta?.total ?? statsRows.length,
      configured,
      pending,
      activeCategories,
    };
  }, [statsQuery.data, statsRows]);

  const categoryColumns = useMemo(
    () =>
      PER_DIEM_DESTINATION_CATEGORIES.map((category) => {
        const { rate, active, labelKey } = PER_DIEM_CATEGORY_FIELDS[category];
        return {
          title: t(labelKey),
          key: category,
          width: 108,
          align: 'right' as const,
          responsive: ['xl'],
          render: (_: unknown, row: EmployeePerDiemRateListItem) => {
            const rateRow = row.rate;
            if (!rateRow) {
              return (
                <span style={{ color: tokens.colorTextTertiary }}>—</span>
              );
            }
            const amount = toRateNumber(rateRow[rate]);
            const isActive = rateRow[active];
            if (amount == null) {
              return (
                <span style={{ color: tokens.colorTextTertiary }}>—</span>
              );
            }
            return (
              <span
                className={isActive ? 'text-sm font-medium' : 'text-sm'}
                style={{
                  color: isActive
                    ? tokens.colorTextPrimary
                    : tokens.colorTextTertiary,
                }}
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
        width: 220,
        render: (_: unknown, row: EmployeePerDiemRateListItem) => (
          <button
            type="button"
            className="m-0 min-w-0 border-0 bg-transparent p-0 text-left"
            onClick={(event) => {
              event.stopPropagation();
              router.push(`/hr/employee-per-diem-rates/${row.employeeId}`);
            }}
          >
            <p
              className="m-0 truncate text-sm font-medium hover:underline"
              style={{ color: tokens.colorPrimary }}
            >
              {formatUserName(row.employee)}
            </p>
            {row.employee.email ? (
              <p
                className="m-0 truncate text-xs"
                style={{ color: tokens.colorTextTertiary }}
              >
                {row.employee.email}
              </p>
            ) : null}
          </button>
        ),
      },
      {
        title: t('common.department'),
        key: 'department',
        width: 150,
        responsive: ['md'],
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
      {
        title: t('pages.hr.employeePerDiemRates.stats.activeCategories'),
        key: 'activeCount',
        width: 110,
        align: 'center',
        render: (_: unknown, row: EmployeePerDiemRateListItem) => {
          const count = countActiveCategories(row.rate);
          if (!row.rate) {
            return (
              <StatusBadge
                label={t('pages.hr.employeePerDiemRates.notConfigured')}
                variant="draft"
              />
            );
          }
          return (
            <span className="text-sm font-medium">
              {count}/{PER_DIEM_DESTINATION_CATEGORIES.length}
            </span>
          );
        },
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
            icon={<EditOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              router.push(`/hr/employee-per-diem-rates/${row.employeeId}/edit`);
            }}
          >
            {t('common.update')}
          </Button>
        ),
      },
    ],
    [categoryColumns, router, t],
  );

  function handleSetupFilter(mode: SetupFilter): void {
    setSetupFilter(mode);
    resetPage();
  }

  function handleResetFilters(): void {
    setSearch('');
    setSetupFilter('all');
    resetPage();
  }

  const hasFilters = Boolean(search.trim()) || setupFilter !== 'all';

  const pageTitle = t('pages.hr.employeePerDiemRates.listTitle');

  if (!canManagePerDiemRates) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
        <Spin />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('hr.messages.employeePerDiemRatesLoadFailed')
          }
        />
      ) : null}

      <div className="mb-1 grid grid-cols-2 gap-3 md:grid-cols-4">
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleSetupFilter('all')}
        >
          <StatCard
            label={t('pages.hr.employeePerDiemRates.stats.total')}
            value={stats.total}
            color="blue"
            icon={<TeamOutlined />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleSetupFilter('configured')}
        >
          <StatCard
            label={t('pages.hr.employeePerDiemRates.stats.configured')}
            value={stats.configured}
            color="green"
            icon={<CheckCircleOutlined />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleSetupFilter('pending')}
        >
          <StatCard
            label={t('pages.hr.employeePerDiemRates.stats.pendingSetup')}
            value={stats.pending}
            color="amber"
            icon={<WarningOutlined />}
          />
        </button>
        <StatCard
          label={t('pages.hr.employeePerDiemRates.stats.activeCategories')}
          value={stats.activeCategories}
          color="teal"
          icon={<BankOutlined />}
        />
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4">
        <div className="erp-filter-bar">
          <ListSearchInput
            committedValue={search}
            onCommit={(value) => {
              setSearch(value);
              resetPage();
            }}
            placeholder={t('hr.placeholder.searchEmployeePerDiemRates')}
            className="w-full min-w-0 sm:w-72"
          />
          <Button
            onClick={handleResetFilters}
            disabled={!hasFilters}
            style={{ borderRadius: 0 }}
          >
            {t('common.reset')}
          </Button>
          <Tooltip title={t('common.refresh')}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={listQuery.isFetching && !listQuery.isLoading}
              onClick={() => void listQuery.refetch()}
              aria-label={t('common.refresh')}
              style={{ borderRadius: 0 }}
            />
          </Tooltip>
        </div>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <BankOutlined style={{ color: tokens.colorPrimary, fontSize: 16 }} />
            <h3
              className="m-0 text-sm font-semibold"
              style={{ color: tokens.colorTextPrimary }}
            >
              {pageTitle}
            </h3>
            <span
              className="text-xs"
              style={{ color: tokens.colorTextTertiary }}
            >
              {filteredRows.length}{' '}
              {setupFilter === 'all'
                ? totalCount === 1
                  ? t('pages.hr.employeePerDiemRates.employeeSingular')
                  : t('pages.hr.employeePerDiemRates.employeePlural')
                : filteredRows.length === 1
                  ? t('pages.hr.employeePerDiemRates.employeeSingular')
                  : t('pages.hr.employeePerDiemRates.employeePlural')}
            </span>
          </div>

          <Space wrap size={8}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/hr/employee-per-diem-rates/new')}
              style={{ borderRadius: 0 }}
            >
              {t('common.update')}
            </Button>
          </Space>
        </div>

        <div className="px-0">
          <DataTable<EmployeePerDiemRateListItem>
            rowKey="employeeId"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={filteredRows}
            loading={listQuery.isFetching && !listQuery.isLoading}
            scroll={{ x: 1200 }}
            onRow={(record) => ({
              onClick: () => {
                router.push(`/hr/employee-per-diem-rates/${record.employeeId}`);
              },
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<BankOutlined style={{ fontSize: 24 }} />}
                  title={t('hr.empty.employeePerDiemRates')}
                  description={t('hr.empty.employeePerDiemRatesDescription')}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('common.update'),
                          onClick: () => router.push('/hr/employee-per-diem-rates/new'),
                        }
                  }
                />
              ),
            }}
            pagination={
              meta
                ? {
                    ...bindMeta(meta),
                    pageSizeOptions: ['10', '20', '50', '100'],
                  }
                : undefined
            }
          />
        </div>
      </div>

      <Drawer
        open={editingEmployeeId != null}
        title={t('hr.dialog.editEmployeePerDiemRates', {
          name: editingEmployeeName,
        })}
        size={720}
        destroyOnHidden
        onClose={() => {
          setEditingEmployeeId(null);
          setEditingEmployeeName('');
        }}
        extra={
          editingEmployeeId ? (
            <Button
              type="link"
              className="px-0"
              onClick={() =>
                router.push(`/hr/employee-per-diem-rates/${editingEmployeeId}`)
              }
            >
              {t('pages.hr.employeePerDiemRates.openProfile')}
            </Button>
          ) : null
        }
      >
        {editingEmployeeId ? (
          <EmployeePerDiemRatesSection
            employeeId={editingEmployeeId}
            editable
            embedded
          />
        ) : null}
      </Drawer>
    </div>
  );
}
