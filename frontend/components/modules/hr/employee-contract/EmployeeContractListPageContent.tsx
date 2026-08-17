'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Select } from 'antd';
import { FileTextOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  EmployeeContractListItem,
  EmployeeContractStatus,
  EmployeeContractType,
} from '@/lib/api/employee-contract.types';
import {
  useEmployeeContracts,
  useMyEmployeeContracts,
} from '@/lib/query/employee-contract';
import { useUsersDirectory } from '@/lib/query/users';
import {
  EMPLOYEE_CONTRACT_STATUS_OPTIONS,
  EMPLOYEE_CONTRACT_TYPE_OPTIONS,
  employeeContractStatusVariant,
  formatEmployeeContractEmployeeName,
  formatEmployeeContractStatus,
  formatEmployeeContractType,
} from '@/lib/utils/employee-contract-display';
import { formatProjectDate } from '@/lib/utils/project-display';

export default function EmployeeContractListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const canViewHr = useCanViewHr();
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EmployeeContractStatus[]>(
    [],
  );
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [contractType, setContractType] = useState<
    EmployeeContractType | undefined
  >();
  const [expiringSoon, setExpiringSoon] = useState(false);

  const statusOptions = useMemo(
    () =>
      EMPLOYEE_CONTRACT_STATUS_OPTIONS.map((option) => ({
        value: option.value,
        label: formatEmployeeContractStatus(option.value, t),
      })),
    [t],
  );

  const contractTypeOptions = useMemo(
    () =>
      EMPLOYEE_CONTRACT_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: formatEmployeeContractType(option.value, t),
      })),
    [t],
  );

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      employeeId: canViewHr ? employeeId : undefined,
      contractType,
      expiringSoon: expiringSoon || undefined,
    }),
    [
      params,
      search,
      statusFilter,
      employeeId,
      contractType,
      expiringSoon,
      canViewHr,
    ],
  );

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );
  const hrListQuery = useEmployeeContracts(listParams, canViewHr);
  const myListQuery = useMyEmployeeContracts(listParams, !canViewHr);
  const listQuery = canViewHr ? hrListQuery : myListQuery;

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const columns: ColumnsType<EmployeeContractListItem> = useMemo(
    () => [
      {
        title: t('hr.table.contractNumber'),
        dataIndex: 'contractNumber',
        key: 'contractNumber',
        width: 120,
      },
      ...(canViewHr
        ? [
            {
              title: t('hr.table.employee'),
              key: 'employee',
              render: (_: unknown, row: EmployeeContractListItem) =>
                formatEmployeeContractEmployeeName(row.employee),
            } satisfies ColumnsType<EmployeeContractListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.contractType'),
        dataIndex: 'contractType',
        key: 'contractType',
        width: 130,
        render: (value: EmployeeContractType) =>
          formatEmployeeContractType(value, t),
      },
      {
        title: t('hr.table.signedAt'),
        dataIndex: 'signedAt',
        key: 'signedAt',
        width: 120,
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
        render: (value: string | undefined) =>
          value ? formatProjectDate(value) : t('hr.labels.openEnded'),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: EmployeeContractStatus) => (
          <StatusBadge
            label={formatEmployeeContractStatus(value, t)}
            variant={employeeContractStatusVariant(value)}
          />
        ),
      },
    ],
    [canViewHr, t],
  );

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
              : t('hr.messages.failedToLoadEmployeeContracts')
          }
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
        <ListSearchInput
          committedValue={search}
          onCommit={(value) => {
            setSearch(value);
            resetPage();
          }}
          placeholder={t('hr.placeholder.searchEmployeeContract')}
          style={{ width: 260 }}
        />

        <Select
          mode="multiple"
          allowClear
          placeholder={t('hr.placeholder.status')}
          options={statusOptions}
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            resetPage();
          }}
          style={{ minWidth: 160 }}
          maxTagCount="responsive"
        />

        <Select
          allowClear
          placeholder={t('hr.placeholder.contractType')}
          options={contractTypeOptions}
          value={contractType}
          onChange={(value) => {
            setContractType(value);
            resetPage();
          }}
          style={{ minWidth: 160 }}
        />

        {canViewHr ? (
          <Select
            showSearch
            allowClear
            placeholder={t('hr.placeholder.employee')}
            loading={usersQuery.isLoading}
            value={employeeId}
            onChange={(value) => {
              setEmployeeId(value);
              resetPage();
            }}
            style={{ width: 200 }}
            filterOption={(input, option) =>
              String(option?.label ?? '')
                .toLowerCase()
                .includes(input.toLowerCase())
            }
            options={
              usersQuery.data?.data?.map((user) => ({
                value: user.id,
                label: `${user.firstName} ${user.lastName}`,
              })) ?? []
            }
          />
        ) : null}

        {canViewHr ? (
          <Checkbox
            checked={expiringSoon}
            onChange={(event) => {
              setExpiringSoon(event.target.checked);
              resetPage();
            }}
          >
            {t('hr.labels.expiringSoon')}
          </Checkbox>
        ) : null}

        {canViewHr ? (
          <div className="ml-auto">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/hr/employee-contract/new')}
            >
              {t('hr.buttons.newEmployeeContract')}
            </Button>
          </div>
        ) : null}
      </div>

      {listQuery.isFetching && listQuery.data ? (
        <TableUpdatingIndicator active={listQuery.isFetching} />
      ) : null}

      <DataTable<EmployeeContractListItem>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={listQuery.isLoading}
        pagination={meta ? bindMeta(meta) : false}
        onRow={(row) => ({
          onClick: () => router.push(`/hr/employee-contract/${row.id}`),
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: (
            <TableEmptyState
              icon={<FileTextOutlined />}
              title={t('hr.empty.noEmployeeContracts')}
            />
          ),
        }}
      />
    </div>
  );
}
