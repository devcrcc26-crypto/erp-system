'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Grid,
  Input,
  Select,
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
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr, useCanViewTeam } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  EmployeeContractListItem,
  EmployeeContractType,
} from '@/lib/api/employee-contract.types';
import type { PaginationMeta } from '@/lib/api/types';
import {
  downloadEmployeeContractImportTemplate,
  useDeleteEmployeeContractRecord,
  useEmployeeContractImport,
  useEmployeeContractImportPreview,
  useEmployeeContractsAll,
  useMyEmployeeContractsAll,
} from '@/lib/query/employee-contract';
import { useUsersDirectory } from '@/lib/query/users';
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
import { formatUserName, teamEmployeeOptions } from '@/lib/utils/user-display';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import { buildEmployeeContractExportSheets } from '@/lib/utils/employee-contract-export';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  slate: { bg: '#EEF1F4', fg: '#64748B' },
} as const;

function ContractStat({
  label,
  value,
  accent,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent: keyof typeof STAT_ACCENT;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}): React.ReactNode {
  const tint = STAT_ACCENT[accent];
  return (
    <button
      type="button"
      className={`erp-users-stat erp-contract-stat${active ? ' erp-contract-stat--active' : ''}`}
      onClick={onClick}
    >
      <span
        className="erp-users-stat-chip"
        style={{ background: tint.bg, color: tint.fg }}
      >
        {icon}
      </span>
      <div className="min-w-0 text-left">
        <p className="erp-users-stat-label">{label}</p>
        <p className="erp-users-stat-value">{value.toLocaleString()}</p>
      </div>
    </button>
  );
}

/**
 * Employee contract list - Users chrome (stat bar, filter row, rounded table).
 */
export default function EmployeeContractListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const canViewHr = useCanViewHr();
  // Supervisors read (never change) their reports' contracts.
  const canViewTeam = useCanViewTeam();
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const deleteMutation = useDeleteEmployeeContractRecord();
  const importPreview = useEmployeeContractImportPreview();
  const importCommit = useEmployeeContractImport();
  const [importOpen, setImportOpen] = useState(false);

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

  const companyListQuery = useEmployeeContractsAll({}, canViewTeam);
  const myListQuery = useMyEmployeeContractsAll({}, !canViewTeam);
  const listQuery = canViewTeam ? companyListQuery : myListQuery;

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const allRows = listQuery.data ?? [];

  // HR picks from the directory; supervisors from the people in their list.
  const employeeOptions = useMemo(
    () =>
      canViewHr
        ? (usersQuery.data?.data ?? []).map((user) => ({
            value: user.id,
            label: formatUserName(user),
          }))
        : teamEmployeeOptions(allRows),
    [canViewHr, usersQuery.data, allRows],
  );

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
        employeeId: canViewTeam ? employeeId : undefined,
      }),
    [allRows, appliedSearch, statusMode, contractType, employeeId, canViewTeam],
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

  const pageTitle = canViewTeam
    ? t('pages.hr.employeeContract.listTitle')
    : t('pages.hr.employeeContract.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.employeeContract.listDescription')
    : canViewTeam
      ? t('pages.hr.teamListDescription')
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
    if (row.status === 'ACTIVE' || row.status === 'DRAFT') {
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
        width: 140,
        render: (value: string) => (
          <span className="erp-users-id-chip">{value}</span>
        ),
      },
      ...(canViewTeam
        ? [
            {
              title: t('hr.table.employee'),
              key: 'employee',
              width: 280,
              responsive: ['md'] as const,
              render: (_: unknown, row: EmployeeContractListItem) => (
                <div className="min-w-0">
                  <p className="erp-users-cell-strong m-0 whitespace-normal break-words">
                    {formatEmployeeContractEmployeeName(row.employee)}
                  </p>
                  {row.employee?.email ? (
                    <p className="erp-users-email m-0 mt-0.5">
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
        render: (value: EmployeeContractType) => (
          <span className="erp-users-cell-strong">
            {formatEmployeeContractType(value, t)}
          </span>
        ),
      },
      {
        title: t('hr.table.signedAt'),
        dataIndex: 'signedAt',
        key: 'signedAt',
        width: 120,
        responsive: ['lg'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">{formatProjectDate(value)}</span>
        ),
      },
      {
        title: t('hr.table.startDate'),
        dataIndex: 'startDate',
        key: 'startDate',
        width: 120,
        render: (value: string) => (
          <span className="erp-users-cell-strong">
            {formatProjectDate(value)}
          </span>
        ),
      },
      {
        title: t('hr.table.endDate'),
        dataIndex: 'endDate',
        key: 'endDate',
        width: 120,
        responsive: ['md'],
        render: (value: string | undefined) => (
          <span className="erp-users-cell-sub">
            {value ? formatProjectDate(value) : t('hr.labels.openEnded')}
          </span>
        ),
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
              width: 52,
              align: 'right' as const,
              render: (_: unknown, row: EmployeeContractListItem) => {
                const items = buildActionMenu(row);
                if (!items || items.length === 0) {
                  return null;
                }
                return (
                  <div
                    className="erp-table-row-actions flex items-center justify-end"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Dropdown menu={{ items }} trigger={['click']} rootClassName="erp-row-actions-menu">
                      <Button
                        size="small"
                        type="text"
                        icon={<MoreOutlined />}
                        aria-label={t('common.actions')}
                      />
                    </Dropdown>
                  </div>
                );
              },
            } satisfies ColumnsType<EmployeeContractListItem>[number],
          ]
        : []),
    ],
    [canViewHr, canViewTeam, t],
  );

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(contractType) ||
    Boolean(employeeId);

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-contract-page ${LIST_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-contract-page ${LIST_PAGE_V2}`}>
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

      {importOpen ? (
        <HrImportModal
          entity="contracts"
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            messageApi.success(summary);
            void listQuery.refetch();
          }}
          downloadTemplate={downloadEmployeeContractImportTemplate}
          previewMutation={importPreview}
          commitMutation={importCommit}
        />
      ) : null}

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

      <div className="erp-users-stat-bar">
        <ContractStat
          label={t('pages.hr.employeeContract.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<FileTextOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        <ContractStat
          label={t('pages.hr.employeeContract.stats.active')}
          value={statusCounts.active}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'active'}
          onClick={() => handleStatusMode('active')}
        />
        <ContractStat
          label={t('pages.hr.employeeContract.stats.expiringSoon')}
          value={statusCounts.expiringSoon}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'expiringSoon'}
          onClick={() => handleStatusMode('expiringSoon')}
        />
        <ContractStat
          label={t('pages.hr.employeeContract.stats.ended')}
          value={statusCounts.ended}
          accent="slate"
          icon={<StopOutlined />}
          active={statusMode === 'ended'}
          onClick={() => handleStatusMode('ended')}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">{pageTitle}</h3>
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
            <HrListActions
              compact={isCompact}
              exports={[
                {
                  key: 'export',
                  label: undefined,
                  filePrefix: 'employee-contracts',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildEmployeeContractExportSheets(filtered),
                },
              ]}
              onImport={canViewHr ? () => setImportOpen(true) : undefined}
              primary={
                canViewHr
                  ? {
                      label: t('hr.buttons.newEmployeeContract'),
                      onClick: () => router.push('/hr/employee-contract/new'),
                    }
                  : undefined
              }
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('hr.placeholder.searchEmployeeContract')}
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              setAppliedSearch(value.trim());
              resetPage();
            }}
            onPressEnter={() => {
              setAppliedSearch(search.trim());
              resetPage();
            }}
            onClear={() => {
              setSearch('');
              setAppliedSearch('');
              resetPage();
            }}
          />
          <span className="erp-users-filter-spacer" aria-hidden />
          <Select
            allowClear
            placeholder={t('hr.placeholder.contractType')}
            className="erp-users-filter-select"
            options={contractTypeOptions}
            value={contractType}
            onChange={(value: EmployeeContractType | undefined) => {
              setContractType(value);
              resetPage();
            }}
          />
          {canViewTeam ? (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('hr.placeholder.employee')}
              className="erp-users-filter-select"
              loading={canViewHr ? usersQuery.isLoading : listQuery.isLoading}
              options={employeeOptions}
              value={employeeId}
              onChange={(value: string | undefined) => {
                setEmployeeId(value);
                resetPage();
              }}
            />
          ) : null}
          {hasFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<EmployeeContractListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            scroll={{ x: isCompact ? 640 : 980 }}
            onRow={(row) => ({
              onClick: () => router.push(`/hr/employee-contract/${row.id}`),
              className: 'cursor-pointer',
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
              simple: screens.sm === false,
              showSizeChanger: screens.sm !== false,
            }}
          />
        </div>
      </div>
    </div>
  );
}
