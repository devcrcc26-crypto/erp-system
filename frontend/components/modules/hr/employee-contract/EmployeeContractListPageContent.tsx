'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Input,
  Select,
  Space,
  Spin,
  Tooltip,
  type MenuProps,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListPageNavIcon from '@/components/ui/ListPageNavIcon/ListPageNavIcon';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  EmployeeContractListItem,
  EmployeeContractType,
} from '@/lib/api/employee-contract.types';
import type { PaginationMeta } from '@/lib/api/types';
import {
  useDeleteEmployeeContractRecord,
  useEmployeeContractsAll,
  useMyEmployeeContractsAll,
} from '@/lib/query/employee-contract';
import { useUsersDirectory } from '@/lib/query/users';
import { tokens } from '@/lib/theme/tokens';
import {
  EMPLOYEE_CONTRACT_TYPE_OPTIONS,
  employeeContractStatusVariant,
  formatEmployeeContractEmployeeName,
  formatEmployeeContractStatus,
  formatEmployeeContractType,
} from '@/lib/utils/employee-contract-display';
import {
  filterEmployeeContracts,
  isEmployeeContractExpiringSoon,
  type EmployeeContractStatusMode,
} from '@/lib/utils/employee-contract-list-filter';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Employee contract list — layout aligned with Users and Leave pages.
 */
export default function EmployeeContractListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const deleteMutation = useDeleteEmployeeContractRecord();

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] =
    useState<EmployeeContractStatusMode>('all');
  const [contractType, setContractType] = useState<
    EmployeeContractType | undefined
  >();
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [deletingContract, setDeletingContract] =
    useState<EmployeeContractListItem | null>(null);

  const contractTypeOptions = useMemo(
    () =>
      EMPLOYEE_CONTRACT_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: formatEmployeeContractType(option.value, t),
      })),
    [t],
  );

  const companyListQuery = useEmployeeContractsAll({}, canViewHr);
  const myListQuery = useMyEmployeeContractsAll({}, !canViewHr);
  const listQuery = canViewHr ? companyListQuery : myListQuery;

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const allRows = listQuery.data ?? [];

  const statusCounts = useMemo(() => {
    const active = allRows.filter((row) => row.status === 'ACTIVE').length;
    const expiringSoon = allRows.filter((row) =>
      isEmployeeContractExpiringSoon(row),
    ).length;
    const ended = allRows.filter((row) =>
      ['TERMINATED', 'EXPIRED', 'SUPERSEDED'].includes(row.status),
    ).length;
    return {
      all: allRows.length,
      active,
      expiringSoon,
      ended,
    };
  }, [allRows]);

  const filtered = useMemo(
    () =>
      filterEmployeeContracts(allRows, {
        search: appliedSearch,
        statusMode,
        contractType,
        employeeId: canViewHr ? employeeId : undefined,
      }),
    [allRows, appliedSearch, statusMode, contractType, employeeId, canViewHr],
  );

  const meta: PaginationMeta = useMemo(() => {
    const total = filtered.length;
    const limit = params.limit ?? 10;
    const page = params.page ?? 1;
    return {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }, [filtered.length, params.limit, params.page]);

  const rows = useMemo(() => {
    const start = (meta.page - 1) * meta.limit;
    return filtered.slice(start, start + meta.limit);
  }, [filtered, meta.page, meta.limit]);

  const pageTitle = canViewHr
    ? t('pages.hr.employeeContract.listTitle')
    : t('pages.hr.employeeContract.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.employeeContract.listDescription')
    : t('pages.hr.employeeContract.myListDescription');

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    setContractType(undefined);
    setEmployeeId(undefined);
    resetPage();
  }

  function handleStatusMode(mode: EmployeeContractStatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  async function handleDeleteContract(): Promise<void> {
    if (!deletingContract) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(deletingContract.id);
      messageApi.success(t('hr.messages.employeeContractDeleted'));
      setDeletingContract(null);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToDeleteEmployeeContract'),
        messageApi,
      );
    }
  }

  function buildActionMenu(
    row: EmployeeContractListItem,
  ): MenuProps['items'] {
    const items: MenuProps['items'] = [];
    if (row.status === 'ACTIVE') {
      items.push({
        key: 'update',
        icon: <EditOutlined />,
        label: t('common.update'),
        onClick: () => router.push(`/hr/employee-contract/${row.id}/edit`),
      });
      items.push({
        key: 'delete',
        icon: <DeleteOutlined />,
        label: t('common.delete'),
        danger: true,
        onClick: () => setDeletingContract(row),
      });
    }
    return items;
  }

  const columns: ColumnsType<EmployeeContractListItem> = useMemo(
    () => [
      {
        title: t('hr.table.contractNumber'),
        dataIndex: 'contractNumber',
        key: 'contractNumber',
        width: 130,
        render: (value: string) => (
          <span
            className="font-[family-name:var(--font-mono)] text-xs font-medium"
            style={{ color: tokens.colorPrimary }}
          >
            {value}
          </span>
        ),
      },
      ...(canViewHr
        ? [
            {
              title: t('hr.table.employee'),
              key: 'employee',
              width: 220,
              responsive: ['md'],
              render: (_: unknown, row: EmployeeContractListItem) => (
                <div className="min-w-0 py-0.5">
                  <p
                    className="m-0 text-sm font-medium"
                    style={{ color: tokens.colorTextPrimary }}
                  >
                    {formatEmployeeContractEmployeeName(row.employee)}
                  </p>
                  {row.employee?.email ? (
                    <p
                      className="m-0 truncate text-xs"
                      style={{ color: tokens.colorTextTertiary }}
                    >
                      {row.employee.email}
                    </p>
                  ) : null}
                </div>
              ),
            } satisfies ColumnsType<EmployeeContractListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.contractType'),
        dataIndex: 'contractType',
        key: 'contractType',
        width: 140,
        responsive: ['md'],
        render: (value: EmployeeContractType) =>
          formatEmployeeContractType(value, t),
      },
      {
        title: t('hr.table.signedAt'),
        dataIndex: 'signedAt',
        key: 'signedAt',
        width: 120,
        responsive: ['lg'],
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.table.startDate'),
        dataIndex: 'startDate',
        key: 'startDate',
        width: 120,
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.table.endDate'),
        dataIndex: 'endDate',
        key: 'endDate',
        width: 120,
        responsive: ['md'],
        render: (value: string | undefined) =>
          value ? formatProjectDate(value) : t('hr.labels.openEnded'),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: EmployeeContractListItem['status']) => (
          <StatusBadge
            label={formatEmployeeContractStatus(value, t)}
            variant={employeeContractStatusVariant(value)}
          />
        ),
      },
      ...(canViewHr
        ? [
            {
              title: '',
              key: 'actions',
              width: 56,
              render: (_: unknown, row: EmployeeContractListItem) => {
                const items = buildActionMenu(row);
                if (!items || items.length === 0) {
                  return null;
                }
                return (
                  <div
                    className="flex items-center justify-end"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Dropdown menu={{ items }} trigger={['click']}>
                      <Button
                        size="small"
                        type="text"
                        icon={<MoreOutlined />}
                        aria-label={t('common.actions')}
                        style={{ borderRadius: 0 }}
                      />
                    </Dropdown>
                  </div>
                );
              },
            } satisfies ColumnsType<EmployeeContractListItem>[number],
          ]
        : []),
    ],
    [canViewHr, router, t],
  );

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(contractType) ||
    Boolean(employeeId);

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ConfirmDialog
        open={Boolean(deletingContract)}
        title={t('hr.dialog.deleteContractTitle')}
        description={t('hr.dialog.deleteContractDesc')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDeleteContract()}
        onCancel={() => setDeletingContract(null)}
      />

      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('hr.messages.failedToLoadEmployeeContracts')
          }
        />
      ) : null}

      <div className="mb-1 grid grid-cols-2 gap-3 md:grid-cols-4">
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('all')}
        >
          <StatCard
            label="Total"
            value={statusCounts.all}
            color="teal"
            icon={<FileTextOutlined />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('active')}
        >
          <StatCard
            label="Active"
            value={statusCounts.active}
            color="green"
            icon={<CheckCircleOutlined />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('expiringSoon')}
        >
          <StatCard
            label={t('hr.labels.expiringSoon')}
            value={statusCounts.expiringSoon}
            color="amber"
            icon={<ClockCircleOutlined />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('ended')}
        >
          <StatCard
            label="Ended"
            value={statusCounts.ended}
            color="default"
            icon={<StopOutlined />}
          />
        </button>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4">
        <div className="erp-filter-bar">
          <Input.Search
            placeholder={t('hr.placeholder.searchEmployeeContract')}
            className="w-full min-w-0 sm:w-72"
            allowClear
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              setAppliedSearch(value.trim());
              resetPage();
            }}
            onSearch={(value) => {
              setSearch(value);
              setAppliedSearch(value.trim());
              resetPage();
            }}
            onClear={() => {
              setSearch('');
              setAppliedSearch('');
              resetPage();
            }}
          />
          <Select
            allowClear
            placeholder={t('hr.placeholder.contractType')}
            className="w-full min-w-0 sm:w-40"
            options={contractTypeOptions}
            value={contractType}
            onChange={(value: EmployeeContractType | undefined) => {
              setContractType(value);
              resetPage();
            }}
          />
          {canViewHr ? (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('hr.placeholder.employee')}
              className="w-full min-w-0 sm:w-48"
              loading={usersQuery.isLoading}
              options={(usersQuery.data?.data ?? []).map((user) => ({
                value: user.id,
                label: formatUserName(user),
              }))}
              value={employeeId}
              onChange={(value: string | undefined) => {
                setEmployeeId(value);
                resetPage();
              }}
            />
          ) : null}
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
            <ListPageNavIcon iconKey="hr-employee-contract" />
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
              {meta.total === 1
                ? t('pages.hr.employeeContract.contractCountOne')
                : t('pages.hr.employeeContract.contractCount', {
                    count: meta.total,
                  })}
            </span>
          </div>
          {canViewHr ? (
            <Space wrap size={8}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => router.push('/hr/employee-contract/new')}
                style={{ borderRadius: 0 }}
              >
                {t('hr.buttons.newEmployeeContract')}
              </Button>
            </Space>
          ) : null}
        </div>

        <div className="px-0">
          <DataTable<EmployeeContractListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            scroll={false}
            onRow={(row) => ({
              onClick: () => router.push(`/hr/employee-contract/${row.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<FileTextOutlined />}
                  title={
                    hasFilters
                      ? t('pages.hr.employeeContract.emptyFiltered')
                      : t('hr.empty.noEmployeeContracts')
                  }
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : canViewHr
                        ? {
                            label: t('hr.buttons.newEmployeeContract'),
                            onClick: () =>
                              router.push('/hr/employee-contract/new'),
                          }
                        : undefined
                  }
                />
              ),
            }}
            pagination={{
              ...bindMeta(meta),
              pageSizeOptions: ['10', '20', '50', '100'],
            }}
          />
        </div>
      </div>
    </div>
  );
}
