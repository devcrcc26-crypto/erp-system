'use client';
import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/users/employees-v2.css';
import './contracts-v2.css';
import { accent } from '@/lib/theme/accent';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Grid,
  Input,
  Select,
  Spin,
  Tag,
  Tooltip,
  type MenuProps,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FileTextOutlined,
  MoreOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { SortOrder } from 'antd/es/table/interface';
import { useRouter } from 'next/navigation';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanViewContractSalary,
  useCanViewHr,
  useCanViewTeam,
} from '@/hooks/use-auth-capabilities';
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
import { formatCurrencyAmount } from '@/lib/utils/expense-claim-display';
import { useAuthStore } from '@/stores/auth.store';
import {
  EMPLOYEE_CONTRACT_TYPE_OPTIONS,
  employeeContractStatusVariant,
  formatEmployeeContractEmployeeName,
  formatEmployeeContractStatus,
  formatEmployeeContractType,
} from '@/lib/utils/employee-contract-display';
import {
  EMPLOYEE_CONTRACT_END_WINDOWS,
  filterEmployeeContracts,
  isEmployeeContractExpiringSoon,
  matchesEmployeeContractEndWindow,
  type EmployeeContractEndWindow,
  type EmployeeContractStatusMode,
} from '@/lib/utils/employee-contract-list-filter';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName, teamEmployeeOptions } from '@/lib/utils/user-display';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import { buildEmployeeContractExportSheets } from '@/lib/utils/employee-contract-export';

const STAT_ACCENT = {
  teal: { bg: accent.light, fg: accent.primary },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  slate: { bg: '#EEF1F4', fg: '#64748B' },
} as const;

// Same list look as Employees (employees-v2.css: brand banner, list card) plus
// contracts-v2.css. No LIST_PAGE_V2: its !important utilities would override it.
const PAGE_ROOT =
  'erp-pro-list-page erp-users-page erp-contract-page erp-employees-v2 erp-contracts-v2 erp-hr-travel-v2';

const MASKED_AMOUNT = '••••';
const SHOW_SALARY_STORAGE_PREFIX = 'erp.contracts.showSalary.';
/** Contracts that no longer pay out: amounts render muted. */
const INACTIVE_CONTRACT_STATUSES: ReadonlySet<EmployeeContractListItem['status']> =
  new Set(['SUPERSEDED', 'TERMINATED', 'EXPIRED']);

function readStoredShowSalary(userId: string): boolean {
  try {
    return (
      window.localStorage.getItem(`${SHOW_SALARY_STORAGE_PREFIX}${userId}`) ===
      '1'
    );
  } catch {
    return false;
  }
}

function writeStoredShowSalary(userId: string, show: boolean): void {
  try {
    window.localStorage.setItem(
      `${SHOW_SALARY_STORAGE_PREFIX}${userId}`,
      show ? '1' : '0',
    );
  } catch {
    // Storage can be blocked (private mode, quota); the toggle still works
    // for this session.
  }
}

/** Basic salary as a number, or null when absent (omitted by the API). */
function basicSalaryValue(row: EmployeeContractListItem): number | null {
  if (row.basicSalary == null || row.basicSalary === '') {
    return null;
  }
  const value = Number(row.basicSalary);
  return Number.isFinite(value) ? value : null;
}

/** Sorts by basic salary; contracts without a figure always go last. */
function sortByBasicSalary(
  rows: EmployeeContractListItem[],
  order: Exclude<SortOrder, null>,
): EmployeeContractListItem[] {
  const direction = order === 'ascend' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = basicSalaryValue(a);
    const right = basicSalaryValue(b);
    if (left === null && right === null) {
      return 0;
    }
    if (left === null) {
      return 1;
    }
    if (right === null) {
      return -1;
    }
    return direction * (left - right);
  });
}

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
      aria-pressed={active}
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
  const canViewContractSalary = useCanViewContractSalary();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [showSalary, setShowSalary] = useState(false);
  const [salarySortOrder, setSalarySortOrder] = useState<SortOrder>(null);
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
  const [endWindow, setEndWindow] = useState<
    EmployeeContractEndWindow | undefined
  >();
  const [deletingContract, setDeletingContract] =
    useState<EmployeeContractListItem | null>(null);

  // Amounts default to masked; the choice is remembered per user. Read after
  // mount so server and client render the same markup.
  useEffect(() => {
    if (!canViewContractSalary || !currentUserId) {
      setShowSalary(false);
      return;
    }
    setShowSalary(readStoredShowSalary(currentUserId));
  }, [canViewContractSalary, currentUserId]);

  const toggleShowSalary = useCallback((): void => {
    setShowSalary((current) => {
      const next = !current;
      if (currentUserId) {
        writeStoredShowSalary(currentUserId, next);
      }
      return next;
    });
  }, [currentUserId]);

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

  const allRows = useMemo(() => listQuery.data ?? [], [listQuery.data]);

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
    const scoped = filterEmployeeContracts(allRows, {
      search: appliedSearch,
      contractType,
      employeeId: canViewTeam ? employeeId : undefined,
    });
    const active = scoped.filter((row) => row.status === 'ACTIVE').length;
    const expiringSoon = scoped.filter((row) =>
      isEmployeeContractExpiringSoon(row),
    ).length;
    const ended = scoped.filter((row) =>
      ['TERMINATED', 'EXPIRED', 'SUPERSEDED'].includes(row.status),
    ).length;
    return {
      all: scoped.length,
      active,
      expiringSoon,
      ended,
    };
  }, [allRows, appliedSearch, contractType, employeeId, canViewTeam]);

  // End-date options show how many contracts each window would list,
  // given the other filters.
  const endWindowOptions = useMemo(() => {
    const scoped = filterEmployeeContracts(allRows, {
      search: appliedSearch,
      statusMode,
      contractType,
      employeeId: canViewTeam ? employeeId : undefined,
    });
    return EMPLOYEE_CONTRACT_END_WINDOWS.map((window) => {
      const count = scoped.filter((row) =>
        matchesEmployeeContractEndWindow(row, window),
      ).length;
      return {
        value: window,
        label: `${t(`pages.hr.employeeContract.endWindow.${window}`)} (${count.toLocaleString()})`,
      };
    });
  }, [allRows, appliedSearch, statusMode, contractType, employeeId, canViewTeam, t]);

  const filtered = useMemo(() => {
    const rows = filterEmployeeContracts(allRows, {
      search: appliedSearch,
      statusMode,
      contractType,
      employeeId: canViewTeam ? employeeId : undefined,
      endWindow,
    });
    // A chosen salary sort wins; it is applied before pagination so it orders
    // the whole filtered list, not just the visible page.
    if (canViewContractSalary && salarySortOrder) {
      return sortByBasicSalary(rows, salarySortOrder);
    }
    if (!endWindow) {
      return rows;
    }
    // In an end-date window, list the soonest ending first (most recent first
    // for last month).
    const direction = endWindow === 'lastMonth' ? -1 : 1;
    return [...rows].sort(
      (a, b) => direction * (a.endDate ?? '').localeCompare(b.endDate ?? ''),
    );
  }, [
    allRows,
    appliedSearch,
    statusMode,
    contractType,
    employeeId,
    canViewTeam,
    endWindow,
    canViewContractSalary,
    salarySortOrder,
  ]);

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
    setEndWindow(undefined);
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
        title: t('hr.table.startDate'),
        dataIndex: 'startDate',
        key: 'startDate',
        width: 120,
        render: (value: string, row: EmployeeContractListItem) => (
          <Tooltip
            title={t('hr.table.contractSignedOn', {
              date: formatProjectDate(row.signedAt),
            })}
          >
            <span className="erp-users-cell-strong">
              {formatProjectDate(value)}
            </span>
          </Tooltip>
        ),
      },
      ...(canViewContractSalary
        ? [
            {
              title: (
                <span className="inline-flex items-center gap-1">
                  {t('hr.table.basicSalary')}
                  <Tooltip
                    title={
                      showSalary
                        ? t('hr.table.contractHideAmounts')
                        : t('hr.table.contractShowAmounts')
                    }
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={
                        showSalary ? <EyeOutlined /> : <EyeInvisibleOutlined />
                      }
                      aria-label={
                        showSalary
                          ? t('hr.table.contractHideAmounts')
                          : t('hr.table.contractShowAmounts')
                      }
                      aria-pressed={showSalary}
                      onClick={(event) => {
                        // Keep the click from also toggling the column sort.
                        event.stopPropagation();
                        toggleShowSalary();
                      }}
                    />
                  </Tooltip>
                </span>
              ),
              key: 'basicSalary',
              width: 210,
              sorter: true,
              sortOrder: salarySortOrder,
              showSorterTooltip: false,
              render: (_: unknown, row: EmployeeContractListItem) => {
                const amount = basicSalaryValue(row);
                if (amount === null) {
                  return <span className="erp-users-cell-sub">-</span>;
                }
                const currency = row.currency ?? 'ETB';
                const display = (value: number): string =>
                  showSalary
                    ? formatCurrencyAmount(value, currency)
                    : MASKED_AMOUNT;
                const muted = INACTIVE_CONTRACT_STATUSES.has(row.status);
                const override = row.activeSalaryOverride;
                const overrideLabel = override
                  ? t('hr.table.contractOverrideBadge', {
                      amount: display(override.amount),
                      date: formatProjectDate(override.effectiveFrom),
                    })
                  : null;
                return (
                  <div className="min-w-0">
                    <p
                      className={`m-0 ${muted ? 'erp-users-cell-sub' : 'erp-users-cell-strong'}`}
                    >
                      {display(amount)}
                    </p>
                    {row.packageTotal != null ? (
                      <p className="erp-users-cell-sub m-0 mt-0.5 text-xs">
                        {t('hr.table.contractPackageLine', {
                          amount: display(row.packageTotal),
                        })}
                      </p>
                    ) : null}
                    {overrideLabel ? (
                      <Tooltip title={overrideLabel}>
                        <Tag
                          bordered={false}
                          className="erp-users-cell-sub !mt-1 !me-0 max-w-full truncate !text-xs"
                        >
                          {overrideLabel}
                        </Tag>
                      </Tooltip>
                    ) : null}
                  </div>
                );
              },
            } satisfies ColumnsType<EmployeeContractListItem>[number],
          ]
        : []),
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
    [
      canViewHr,
      canViewTeam,
      canViewContractSalary,
      showSalary,
      salarySortOrder,
      toggleShowSalary,
      t,
    ],
  );

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(contractType) ||
    Boolean(employeeId) ||
    Boolean(endWindow);

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={PAGE_ROOT}>
        <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className={PAGE_ROOT}>
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

      <section
        className="erp-employees-hero"
        aria-labelledby="erp-contracts-hero-title"
      >
        <div className="erp-employees-hero-top">
          <h2 id="erp-contracts-hero-title" className="erp-employees-hero-title">
            {statusCounts.all === 1
              ? t('pages.hr.employeeContract.contractCountOne')
              : t('pages.hr.employeeContract.contractCount', {
                  count: statusCounts.all.toLocaleString(),
                })}
          </h2>
          <div className="erp-employees-hero-actions">
            <HrListActions
              compact={isCompact}
              exports={[
                {
                  key: 'export',
                  label: undefined,
                  filePrefix: 'employee-contracts',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildEmployeeContractExportSheets(filtered, {
                      includeSalary: canViewContractSalary,
                    }),
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
        {/* Status filters: click to filter, click again to show all. */}
        <div className="erp-users-stat-bar erp-employees-hero-stats">
          <ContractStat
            label={t('pages.hr.employeeContract.stats.active')}
            value={statusCounts.active}
            accent="green"
            icon={<CheckCircleOutlined />}
            active={statusMode === 'active'}
            onClick={() => handleStatusMode(statusMode === 'active' ? 'all' : 'active')}
          />
          <ContractStat
            label={t('pages.hr.employeeContract.stats.expiringSoon')}
            value={statusCounts.expiringSoon}
            accent="amber"
            icon={<ClockCircleOutlined />}
            active={statusMode === 'expiringSoon'}
            onClick={() => handleStatusMode(statusMode === 'expiringSoon' ? 'all' : 'expiringSoon')}
          />
          <ContractStat
            label={t('pages.hr.employeeContract.stats.ended')}
            value={statusCounts.ended}
            accent="slate"
            icon={<StopOutlined />}
            active={statusMode === 'ended'}
            onClick={() => handleStatusMode(statusMode === 'ended' ? 'all' : 'ended')}
          />
        </div>
      </section>

      <div className="erp-pro-card erp-employees-list-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-3">
            <span aria-hidden className="erp-employees-card-icon">
              <FileTextOutlined />
            </span>
            <h3 className="erp-pro-card-toolbar-title">{pageTitle}</h3>
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
            placeholder={t('pages.hr.employeeContract.endWindow.placeholder')}
            aria-label={t('pages.hr.employeeContract.endWindow.placeholder')}
            className="erp-users-filter-select"
            popupMatchSelectWidth={false}
            options={endWindowOptions}
            value={endWindow}
            onChange={(value: EmployeeContractEndWindow | undefined) => {
              setEndWindow(value);
              resetPage();
            }}
          />
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
            scroll={{ x: isCompact ? 640 : canViewContractSalary ? 1100 : 980 }}
            onChange={(_pagination, _filters, sorter, extra) => {
              if (extra.action !== 'sort') {
                return;
              }
              // Sorting is client-side (see `filtered`); only one column sorts.
              const active = Array.isArray(sorter) ? sorter[0] : sorter;
              setSalarySortOrder(active?.order ?? null);
              resetPage();
            }}
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
