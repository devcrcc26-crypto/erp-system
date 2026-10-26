'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/users/employees-v2.css';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Grid,
  Input,
  Spin,
  Tooltip,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  BankOutlined,
  CheckCircleOutlined,
  EditOutlined,
  EyeOutlined,
  MoreOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import HrPersonCell from '@/components/modules/hr/shared/HrPersonCell';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanManageEmployeePerDiemRates } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type { EmployeePerDiemRateListItem } from '@/lib/api/per-diem.types';
import type { PaginationMeta } from '@/lib/api/types';
import {
  PER_DIEM_CATEGORY_FIELDS,
  PER_DIEM_DESTINATION_CATEGORIES,
} from '@/lib/constants/per-diem-destination-categories';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import ImportModal from '@/components/modules/hr/import-export/ImportModal';
import { useEmployeePerDiemRatesAll } from '@/lib/query/per-diem';
import { buildEmployeePerDiemRateExportSheets } from '@/lib/utils/per-diem-export';
import { employeePerDiemRateImportSchema } from '@/lib/utils/hr-import-configs';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import {
  countActivePerDiemCategories,
  filterEmployeePerDiemRates,
  type EmployeePerDiemSetupFilter,
} from '@/lib/utils/employee-per-diem-list-filter';
import { formatUserName } from '@/lib/utils/user-display';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
} as const;

function toRateNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function RateStat({
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
  active?: boolean;
  onClick?: () => void;
}): React.ReactNode {
  const tint = STAT_ACCENT[accent];
  const className = `erp-users-stat erp-contract-stat${active ? ' erp-contract-stat--active' : ''}${onClick ? '' : ' erp-contract-stat--static'}`;

  if (!onClick) {
    return (
      <div className={className}>
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
      </div>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick}>
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
 * HR employee per diem rates list - Users chrome.
 */
export default function EmployeePerDiemRatesListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canManagePerDiemRates = useCanManageEmployeePerDiemRates();
  const [importOpen, setImportOpen] = useState(false);
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [setupFilter, setSetupFilter] =
    useState<EmployeePerDiemSetupFilter>('all');

  const listQuery = useEmployeePerDiemRatesAll(canManagePerDiemRates);
  const allRows = listQuery.data ?? [];

  const stats = useMemo(() => {
    const configured = allRows.filter((row) => row.rate != null).length;
    const pending = allRows.filter((row) => row.rate == null).length;
    const activeCategories = allRows.reduce(
      (sum, row) => sum + countActivePerDiemCategories(row.rate),
      0,
    );
    return {
      total: allRows.length,
      configured,
      pending,
      activeCategories,
    };
  }, [allRows]);

  const filtered = useMemo(
    () =>
      filterEmployeePerDiemRates(allRows, {
        search: appliedSearch,
        setupFilter,
      }),
    [allRows, appliedSearch, setupFilter],
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

  const categoryColumns = useMemo(
    () =>
      PER_DIEM_DESTINATION_CATEGORIES.map((category) => {
        const { rate, active, labelKey } = PER_DIEM_CATEGORY_FIELDS[category];
        return {
          title: t(labelKey),
          key: category,
          width: 108,
          align: 'right' as const,
          responsive: ['xl'] as const,
          render: (_: unknown, row: EmployeePerDiemRateListItem) => {
            const rateRow = row.rate;
            if (!rateRow) {
              return <span className="erp-users-cell-sub">-</span>;
            }
            const amount = toRateNumber(rateRow[rate]);
            const isActive = rateRow[active];
            if (amount == null) {
              return <span className="erp-users-cell-sub">-</span>;
            }
            const lowEtb =
              (category === 'Regional' || category === 'International') &&
              amount < 1000;
            return (
              <span className="inline-flex flex-col items-end">
                <span
                  className={
                    isActive
                      ? 'erp-users-cell-strong text-sm'
                      : 'erp-users-cell-sub text-sm'
                  }
                  title={isActive ? undefined : t('hr.table.inactiveCategory')}
                >
                  {formatEtbAmount(amount)}
                </span>
                {lowEtb ? (
                  <span className="mt-0.5 max-w-[140px] text-left text-[11px] leading-snug text-[#BA7517]">
                    {t('pages.hr.employeePerDiemRates.lowEtbWarning')}
                  </span>
                ) : null}
              </span>
            );
          },
        } satisfies ColumnsType<EmployeePerDiemRateListItem>[number];
      }),
    [t],
  );

  function buildActionMenu(
    row: EmployeePerDiemRateListItem,
  ): MenuProps['items'] {
    return [
      {
        key: 'view',
        icon: <EyeOutlined />,
        label: t('common.view'),
        onClick: () =>
          router.push(`/hr/employee-per-diem-rates/${row.employeeId}`),
      },
      {
        key: 'update',
        icon: <EditOutlined />,
        label: t('common.update'),
        onClick: () =>
          router.push(`/hr/employee-per-diem-rates/${row.employeeId}/edit`),
      },
    ];
  }

  const columns: ColumnsType<EmployeePerDiemRateListItem> = useMemo(
    () => [
      {
        title: t('hr.table.employee'),
        key: 'employee',
        fixed: isNarrow ? undefined : 'left',
        width: 220,
        render: (_: unknown, row: EmployeePerDiemRateListItem) => (
          <div className="min-w-0">
            <HrPersonCell
              person={row.employee}
              name={formatUserName(row.employee)}
            />
            <p className="erp-users-cell-sub m-0 mt-0.5 pl-[52px] md:hidden">
              {row.employee.department?.name ?? '-'}
            </p>
          </div>
        ),
      },
      {
        title: t('common.department'),
        key: 'department',
        width: 150,
        responsive: ['md'],
        render: (_: unknown, row: EmployeePerDiemRateListItem) => (
          <span className="erp-users-cell-sub">
            {row.employee.department?.name ?? '-'}
          </span>
        ),
      },
      {
        title: t('pages.hr.employeePerDiemRates.stats.activeCategories'),
        key: 'activeCount',
        width: 120,
        align: 'center',
        render: (_: unknown, row: EmployeePerDiemRateListItem) => {
          const count = countActivePerDiemCategories(row.rate);
          if (!row.rate) {
            return (
              <StatusBadge
                label={t('pages.hr.employeePerDiemRates.notConfigured')}
                variant="default"
              />
            );
          }
          return (
            <span className="erp-users-cell-strong">
              {count}/{PER_DIEM_DESTINATION_CATEGORIES.length}
            </span>
          );
        },
      },
      ...categoryColumns,
      {
        title: '',
        key: 'actions',
        width: 52,
        align: 'right',
        fixed: isNarrow ? undefined : 'right',
        render: (_: unknown, row: EmployeePerDiemRateListItem) => (
          <div
            className="erp-table-row-actions flex items-center justify-end"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Dropdown
              menu={{ items: buildActionMenu(row) }}
              trigger={['click']}
              placement="bottomRight"
              rootClassName="erp-row-actions-menu"
            >
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                aria-label={t('common.actions')}
              />
            </Dropdown>
          </div>
        ),
      },
    ],
    [categoryColumns, isNarrow, router, t],
  );

  function handleSetupFilter(mode: EmployeePerDiemSetupFilter): void {
    setSetupFilter(mode);
    resetPage();
  }

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setSetupFilter('all');
    resetPage();
  }

  const hasFilters =
    Boolean(appliedSearch.trim()) || setupFilter !== 'all';

  const pageTitle = t('pages.hr.employeePerDiemRates.listTitle');
  const pageDescription = t('pages.hr.employeePerDiemRates.listDescription');

  if (!canManagePerDiemRates) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-employee-per-diem-rates-page ${LIST_PAGE_V2}`}>
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-employee-per-diem-rates-page ${LIST_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-employee-per-diem-rates-page ${LIST_PAGE_V2}`}>
      {importOpen ? (
        <ImportModal
          schema={employeePerDiemRateImportSchema}
          title={t('hr.exportImport.employeePerDiemRates.title')}
          description={t('hr.exportImport.employeePerDiemRates.description')}
          onClose={() => setImportOpen(false)}
          onImported={() => void listQuery.refetch()}
        />
      ) : null}

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

      <div className="erp-users-stat-bar">
        <RateStat
          label={t('pages.hr.employeePerDiemRates.stats.total')}
          value={stats.total}
          accent="blue"
          icon={<TeamOutlined />}
          active={setupFilter === 'all'}
          onClick={() => handleSetupFilter('all')}
        />
        <RateStat
          label={t('pages.hr.employeePerDiemRates.stats.configured')}
          value={stats.configured}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={setupFilter === 'configured'}
          onClick={() => handleSetupFilter('configured')}
        />
        <RateStat
          label={t('pages.hr.employeePerDiemRates.stats.pendingSetup')}
          value={stats.pending}
          accent="amber"
          icon={<WarningOutlined />}
          active={setupFilter === 'pending'}
          onClick={() => handleSetupFilter('pending')}
        />
        <RateStat
          label={t('pages.hr.employeePerDiemRates.stats.activeCategories')}
          value={stats.activeCategories}
          accent="teal"
          icon={<BankOutlined />}
        />
      </div>

      <div className="erp-pro-card erp-employees-list-card">
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
                  key: 'rates',
                  label: t('hr.exportImport.employeePerDiemRates.export'),
                  filePrefix: 'employee-per-diem-rates',
                  disabled: filtered.length === 0,
                  buildSheets: () =>
                    buildEmployeePerDiemRateExportSheets(filtered),
                },
              ]}
              onImport={canManagePerDiemRates ? () => setImportOpen(true) : undefined}
              primary={{
                label: t('pages.hr.employeePerDiemRates.addRates'),
                onClick: () => router.push('/hr/employee-per-diem-rates/new'),
              }}
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.employeePerDiemRates.searchPlaceholder')}
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
          {hasFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<EmployeePerDiemRateListItem>
            rowKey="employeeId"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && rows.length === 0}
            scroll={{ x: isNarrow ? 560 : isCompact ? 800 : 1200 }}
            onRow={(record) => ({
              onClick: () =>
                router.push(
                  `/hr/employee-per-diem-rates/${record.employeeId}`,
                ),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<BankOutlined style={{ fontSize: 28 }} />}
                  title={
                    hasFilters
                      ? t('pages.hr.employeePerDiemRates.emptyFiltered')
                      : t('hr.empty.employeePerDiemRates')
                  }
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('pages.hr.employeePerDiemRates.addRates'),
                          onClick: () =>
                            router.push('/hr/employee-per-diem-rates/new'),
                        }
                  }
                />
              ),
            }}
            pagination={{
              ...bindMeta(meta),
              pageSizeOptions: ['10', '20', '50', '100'],
              simple: isNarrow,
              showSizeChanger: !isNarrow,
            }}
          />
        </div>
      </div>
    </div>
  );
}
