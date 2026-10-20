'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Grid,
  Input,
  Select,
  Spin,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FormOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type { VehicleRefuelingListItem } from '@/lib/api/vehicle-refueling.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useVehicleRefuelingsAll } from '@/lib/query/vehicle-refueling';
import { useUsersDirectory } from '@/lib/query/users';
import { formatFuelType } from '@/lib/utils/company-vehicle-display';
import {
  formatVehicleRefuelingEmployeeName,
  formatVehicleRefuelingStatus,
  vehicleRefuelingStatusVariant,
} from '@/lib/utils/vehicle-refueling-display';
import {
  DRAFT_STATUSES,
  filterVehicleRefuelings,
  statusesForVehicleRefuelingMode,
  type VehicleRefuelingStatusMode,
} from '@/lib/utils/vehicle-refueling-list-filter';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import ImportModal from '@/components/modules/hr/import-export/ImportModal';
import { vehicleRefuelingImportSchema } from '@/lib/utils/hr-import-configs';
import { buildVehicleRefuelingExportSheets } from '@/lib/utils/vehicle-refueling-export';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
const PENDING_STATUSES = statusesForVehicleRefuelingMode('pending');
const APPROVED_STATUSES = statusesForVehicleRefuelingMode('approved');
const REJECTED_STATUSES = statusesForVehicleRefuelingMode('rejected');

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
} as const;

function VehicleRefuelingStat({
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
 * Vehicle refueling list - Users chrome (stat bar, filter row, soft table).
 */
export default function VehicleRefuelingListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] =
    useState<VehicleRefuelingStatusMode>('all');
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  const [importOpen, setImportOpen] = useState(false);
  const listQuery = useVehicleRefuelingsAll({}, true);

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const allRows = listQuery.data ?? [];

  const statusCounts = useMemo(() => {
    const draft = allRows.filter((row) =>
      DRAFT_STATUSES.includes(row.status),
    ).length;
    const pending = allRows.filter((row) =>
      PENDING_STATUSES.includes(row.status),
    ).length;
    const approved = allRows.filter((row) =>
      APPROVED_STATUSES.includes(row.status),
    ).length;
    const rejected = allRows.filter((row) =>
      REJECTED_STATUSES.includes(row.status),
    ).length;
    return {
      all: allRows.length,
      draft,
      pending,
      approved,
      rejected,
    };
  }, [allRows]);

  const filtered = useMemo(
    () =>
      filterVehicleRefuelings(allRows, {
        search: appliedSearch,
        statusMode,
        employeeId: canViewHr ? employeeId : undefined,
        dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
        dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
      }),
    [allRows, appliedSearch, statusMode, employeeId, dateRange, canViewHr],
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
    ? t('pages.hr.vehicleRefueling.listTitle')
    : t('pages.hr.vehicleRefueling.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.vehicleRefueling.listDescription')
    : t('pages.hr.vehicleRefueling.myListDescription');

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    setEmployeeId(undefined);
    setDateRange(null);
    resetPage();
  }

  function handleStatusMode(mode: VehicleRefuelingStatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(employeeId) ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  const columns: ColumnsType<VehicleRefuelingListItem> = useMemo(
    () => [
      {
        title: t('hr.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 130,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-id-chip">{value}</span>
        ),
      },
      ...(canViewHr
        ? [
            {
              title: t('hr.table.employee'),
              key: 'employee',
              width: 200,
              responsive: ['md'],
              render: (_: unknown, row: VehicleRefuelingListItem) => (
                <div className="min-w-0">
                  <p className="erp-users-cell-strong m-0">
                    {formatVehicleRefuelingEmployeeName(row.employee)}
                  </p>
                  {row.employee?.email ? (
                    <p className="erp-users-email m-0 mt-0.5">
                      {row.employee.email}
                    </p>
                  ) : null}
                </div>
              ),
            } satisfies ColumnsType<VehicleRefuelingListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.vehicle'),
        key: 'vehicle',
        width: isNarrow ? undefined : 160,
        ellipsis: true,
        render: (_: unknown, row: VehicleRefuelingListItem) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">
              {row.vehicle?.plateNumber ?? '-'}
            </p>
            <p className="erp-users-cell-sub m-0 mt-0.5 truncate">
              {row.vehicle
                ? `${row.vehicle.make} ${row.vehicle.model}`
                : row.requestNumber}
              {isNarrow ? ` · ${row.fuelStation}` : ''}
            </p>
          </div>
        ),
      },
      {
        title: t('hr.table.fuelStation'),
        dataIndex: 'fuelStation',
        key: 'fuelStation',
        width: isNarrow ? 140 : 180,
        ellipsis: true,
        responsive: ['sm'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">{value}</span>
        ),
      },
      {
        title: t('hr.table.fuelDate'),
        dataIndex: 'fuelDate',
        key: 'fuelDate',
        width: 120,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">
            {formatProjectDate(value)}
          </span>
        ),
      },
      {
        title: t('hr.table.fuelType'),
        dataIndex: 'fuelType',
        key: 'fuelType',
        width: 100,
        responsive: ['lg'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">
            {formatFuelType(value, t)}
          </span>
        ),
      },
      {
        title: t('hr.table.litres'),
        dataIndex: 'requestedLitres',
        key: 'requestedLitres',
        width: 80,
        align: 'right',
        responsive: ['lg'],
        render: (value: number | string | null | undefined) => (
          <span className="erp-users-cell-sub tabular-nums">
            {value ?? '-'}
          </span>
        ),
      },
      {
        title: t('hr.table.totalCostEtb'),
        dataIndex: 'totalCostEtb',
        key: 'totalCostEtb',
        width: 110,
        align: 'right',
        responsive: ['lg'],
        render: (value: number | string | null | undefined) => (
          <span className="erp-users-cell-sub tabular-nums">
            {value != null ? formatEtbAmount(value) : '-'}
          </span>
        ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: isNarrow ? 100 : 130,
        render: (value: VehicleRefuelingListItem['status']) => (
          <StatusBadge
            label={formatVehicleRefuelingStatus(value, t)}
            variant={vehicleRefuelingStatusVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.currentTier'),
        dataIndex: 'currentTierLabel',
        key: 'currentTierLabel',
        width: 140,
        ellipsis: true,
        responsive: ['xl'],
        render: (_: unknown, row: VehicleRefuelingListItem) => {
          if (row.directApproved) {
            return (
              <span className="erp-users-role-tag">
                {t('hr.labels.directApproval')}
              </span>
            );
          }
          return row.currentTierLabel ? (
            <span className="erp-users-role-tag">{row.currentTierLabel}</span>
          ) : (
            <span className="erp-users-cell-sub">-</span>
          );
        },
      },
    ],
    [canViewHr, isNarrow, t],
  );

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-vehicle-refueling-page ${LIST_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-vehicle-refueling-page ${LIST_PAGE_V2}`}>
      {importOpen ? (
        <ImportModal
          schema={vehicleRefuelingImportSchema}
          title={t('hr.exportImport.vehicleRefuelings.title')}
          description={t('hr.exportImport.vehicleRefuelings.description')}
          onClose={() => setImportOpen(false)}
          onImported={() => void listQuery.refetch()}
        />
      ) : null}

      {listQuery.isError ? (
        <ErpNotice
          tone="error"
          className="mb-4"
          title={getFriendlyApiErrorMessage(
            listQuery.error,
            t('hr.messages.vehicleRefuelingLoadFailed'),
            t,
          )}
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <VehicleRefuelingStat
          label={t('pages.hr.vehicleRefueling.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<ThunderboltOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        {!canViewHr ? (
          <VehicleRefuelingStat
            label={t('pages.hr.vehicleRefueling.stats.draft')}
            value={statusCounts.draft}
            accent="blue"
            icon={<FormOutlined />}
            active={statusMode === 'draft'}
            onClick={() => handleStatusMode('draft')}
          />
        ) : null}
        <VehicleRefuelingStat
          label={t('pages.hr.vehicleRefueling.stats.pending')}
          value={statusCounts.pending}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'pending'}
          onClick={() => handleStatusMode('pending')}
        />
        <VehicleRefuelingStat
          label={t('pages.hr.vehicleRefueling.stats.approved')}
          value={statusCounts.approved}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'approved'}
          onClick={() => handleStatusMode('approved')}
        />
        <VehicleRefuelingStat
          label={t('pages.hr.vehicleRefueling.stats.rejected')}
          value={statusCounts.rejected}
          accent="red"
          icon={<CloseCircleOutlined />}
          active={statusMode === 'rejected'}
          onClick={() => handleStatusMode('rejected')}
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
                  key: 'refuelings',
                  label: t('hr.exportImport.vehicleRefuelings.export'),
                  filePrefix: 'vehicle-refueling',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildVehicleRefuelingExportSheets(filtered),
                },
              ]}
              onImport={canViewHr ? () => setImportOpen(true) : undefined}
              primary={{
                label: t('hr.buttons.newVehicleRefueling'),
                onClick: () => router.push('/approvals/new/vehicle-refueling'),
              }}
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.vehicleRefueling.searchPlaceholder')}
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
          {canViewHr ? (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('hr.placeholder.employee')}
              className="erp-users-filter-select"
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
          <DatePicker.RangePicker
            value={dateRange}
            className="erp-users-filter-daterange"
            onChange={(value) => {
              setDateRange(value);
              resetPage();
            }}
          />
          {hasFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<VehicleRefuelingListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && rows.length === 0}
            scroll={{ x: isNarrow ? 560 : isCompact ? 860 : 1200 }}
            onRow={(record) => ({
              onClick: () =>
                router.push(`/hr/vehicle-refueling/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<ThunderboltOutlined />}
                  title={
                    hasFilters
                      ? t('pages.hr.vehicleRefueling.emptyFiltered')
                      : t('hr.empty.noRefuelingRequests')
                  }
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('hr.buttons.newVehicleRefueling'),
                          onClick: () =>
                            router.push('/approvals/new/vehicle-refueling'),
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
