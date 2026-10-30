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
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FormOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr, useCanViewTeam } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type { VehicleApplicationListItem } from '@/lib/api/vehicle-application.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useVehicleApplicationsAll } from '@/lib/query/vehicle-application';
import { useUsersDirectory } from '@/lib/query/users';
import {
  formatVehicleApplicationEmployeeName,
  formatVehicleApplicationStatus,
  vehicleApplicationStatusVariant,
} from '@/lib/utils/vehicle-application-display';
import {
  DRAFT_STATUSES,
  filterVehicleApplications,
  statusesForVehicleApplicationMode,
  type VehicleApplicationStatusMode,
} from '@/lib/utils/vehicle-application-list-filter';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName, teamEmployeeOptions } from '@/lib/utils/user-display';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import ImportModal from '@/components/modules/hr/import-export/ImportModal';
import { vehicleApplicationImportSchema } from '@/lib/utils/hr-import-configs';
import { buildVehicleApplicationExportSheets } from '@/lib/utils/vehicle-application-export';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
const PENDING_STATUSES = statusesForVehicleApplicationMode('pending');
const APPROVED_STATUSES = statusesForVehicleApplicationMode('approved');
const REJECTED_STATUSES = statusesForVehicleApplicationMode('rejected');

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
} as const;

function VehicleApplicationStat({
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
 * Vehicle applications list - Users chrome (stat bar, filter row, rounded table).
 */
export default function VehicleApplicationListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  // Supervisors see their team's rows (backend-scoped); HR tools stay HR-only.
  const canViewTeam = useCanViewTeam();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] =
    useState<VehicleApplicationStatusMode>('all');
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  const [importOpen, setImportOpen] = useState(false);
  const listQuery = useVehicleApplicationsAll({}, true);

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
      filterVehicleApplications(allRows, {
        search: appliedSearch,
        statusMode,
        employeeId: canViewTeam ? employeeId : undefined,
        dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
        dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
      }),
    [allRows, appliedSearch, statusMode, employeeId, dateRange, canViewTeam],
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
    ? t('pages.hr.vehicleApplication.listTitle')
    : t('pages.hr.vehicleApplication.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.vehicleApplication.listDescription')
    : canViewTeam
      ? t('pages.hr.teamListDescription')
      : t('pages.hr.vehicleApplication.myListDescription');

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    setEmployeeId(undefined);
    setDateRange(null);
    resetPage();
  }

  function handleStatusMode(mode: VehicleApplicationStatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(employeeId) ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  const columns: ColumnsType<VehicleApplicationListItem> = useMemo(
    () => [
      {
        title: t('hr.table.applicationNumber'),
        dataIndex: 'applicationNumber',
        key: 'applicationNumber',
        width: 130,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-id-chip">{value}</span>
        ),
      },
      ...(canViewTeam
        ? [
            {
              title: t('hr.table.employee'),
              key: 'employee',
              width: 200,
              responsive: ['md'],
              render: (_: unknown, row: VehicleApplicationListItem) => (
                <div className="min-w-0">
                  <p className="erp-users-cell-strong m-0">
                    {formatVehicleApplicationEmployeeName(row.employee)}
                  </p>
                  {row.employee?.email ? (
                    <p className="erp-users-email m-0 mt-0.5">
                      {row.employee.email}
                    </p>
                  ) : null}
                </div>
              ),
            } satisfies ColumnsType<VehicleApplicationListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.vehicle'),
        key: 'vehicle',
        width: isNarrow ? undefined : 160,
        ellipsis: true,
        render: (_: unknown, row: VehicleApplicationListItem) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">
              {row.vehicle?.plateNumber ?? '-'}
            </p>
            <p className="erp-users-cell-sub m-0 mt-0.5 truncate">
              {row.vehicle
                ? `${row.vehicle.make} ${row.vehicle.model}`
                : row.applicationNumber}
              {isNarrow ? ` · ${row.destination}` : ''}
            </p>
          </div>
        ),
      },
      {
        title: t('hr.table.destination'),
        dataIndex: 'destination',
        key: 'destination',
        width: isNarrow ? 180 : 260,
        ellipsis: true,
        responsive: ['sm'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">{value}</span>
        ),
      },
      {
        title: t('hr.table.departure'),
        dataIndex: 'departureDatetime',
        key: 'departureDatetime',
        width: 140,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">
            {formatProjectDate(value)}
          </span>
        ),
      },
      {
        title: t('hr.labels.return'),
        dataIndex: 'returnDatetime',
        key: 'returnDatetime',
        width: 140,
        responsive: ['lg'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">
            {formatProjectDate(value)}
          </span>
        ),
      },
      {
        title: t('hr.table.passengers'),
        dataIndex: 'passengerCount',
        key: 'passengerCount',
        width: 90,
        align: 'right',
        responsive: ['lg'],
        render: (value: number) => (
          <span className="erp-users-cell-sub tabular-nums">{value}</span>
        ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: isNarrow ? 100 : 130,
        render: (value: VehicleApplicationListItem['status']) => (
          <StatusBadge
            label={formatVehicleApplicationStatus(value, t)}
            variant={vehicleApplicationStatusVariant(value)}
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
        render: (_: unknown, row: VehicleApplicationListItem) => {
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
    [canViewTeam, isNarrow, t],
  );

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-vehicle-applications-page ${LIST_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-vehicle-applications-page ${LIST_PAGE_V2}`}>
      {importOpen ? (
        <ImportModal
          schema={vehicleApplicationImportSchema}
          title={t('hr.exportImport.vehicleApplications.title')}
          description={t('hr.exportImport.vehicleApplications.description')}
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
            t('hr.messages.vehicleApplicationLoadFailed'),
            t,
          )}
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <VehicleApplicationStat
          label={t('pages.hr.vehicleApplication.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<CarOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        {!canViewHr ? (
          <VehicleApplicationStat
            label={t('pages.hr.vehicleApplication.stats.draft')}
            value={statusCounts.draft}
            accent="blue"
            icon={<FormOutlined />}
            active={statusMode === 'draft'}
            onClick={() => handleStatusMode('draft')}
          />
        ) : null}
        <VehicleApplicationStat
          label={t('pages.hr.vehicleApplication.stats.pending')}
          value={statusCounts.pending}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'pending'}
          onClick={() => handleStatusMode('pending')}
        />
        <VehicleApplicationStat
          label={t('pages.hr.vehicleApplication.stats.approved')}
          value={statusCounts.approved}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'approved'}
          onClick={() => handleStatusMode('approved')}
        />
        <VehicleApplicationStat
          label={t('pages.hr.vehicleApplication.stats.rejected')}
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
                  key: 'applications',
                  label: t('hr.exportImport.vehicleApplications.export'),
                  filePrefix: 'vehicle-applications',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildVehicleApplicationExportSheets(filtered),
                },
              ]}
              onImport={canViewHr ? () => setImportOpen(true) : undefined}
              primary={{
                label: t('hr.buttons.newVehicleApplication'),
                onClick: () => router.push('/approvals/new/vehicle-application'),
              }}
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.vehicleApplication.searchPlaceholder')}
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
          <DataTable<VehicleApplicationListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && rows.length === 0}
            scroll={{ x: isNarrow ? 560 : isCompact ? 860 : 1200 }}
            onRow={(record) => ({
              onClick: () =>
                router.push(`/hr/vehicle-applications/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<CarOutlined />}
                  title={
                    hasFilters
                      ? t('pages.hr.vehicleApplication.emptyFiltered')
                      : t('hr.empty.noVehicleApplications')
                  }
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('hr.buttons.newVehicleApplication'),
                          onClick: () =>
                            router.push(
                              '/approvals/new/vehicle-application',
                            ),
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
