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
  ReloadOutlined,
  SearchOutlined,
  ToolOutlined,
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
import type { InspectionRepairListItem } from '@/lib/api/inspection-repair.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useInspectionRepairsAll } from '@/lib/query/inspection-repair';
import { useUsersDirectory } from '@/lib/query/users';
import {
  formatInspectionRepairEmployeeName,
  formatInspectionRepairStatus,
  inspectionRepairStatusVariant,
} from '@/lib/utils/inspection-repair-display';
import {
  filterInspectionRepairs,
  statusesForInspectionRepairMode,
  type InspectionRepairStatusMode,
} from '@/lib/utils/inspection-repair-list-filter';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import ImportModal from '@/components/modules/hr/import-export/ImportModal';
import { buildInspectionRepairExportSheets } from '@/lib/utils/inspection-repair-export';
import { inspectionRepairImportSchema } from '@/lib/utils/hr-import-configs';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
const PENDING_STATUSES = statusesForInspectionRepairMode('pending');
const ACTIVE_STATUSES = statusesForInspectionRepairMode('active');
const DONE_STATUSES = statusesForInspectionRepairMode('done');

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
} as const;

function InspectionRepairStat({
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
 * Inspection & repair list - Users chrome (stat bar, filter row, soft table).
 */
export default function InspectionRepairListPageContent(): React.ReactNode {
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
    useState<InspectionRepairStatusMode>('all');
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  const [importOpen, setImportOpen] = useState(false);

  const listQuery = useInspectionRepairsAll({}, true);
  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const allRows = listQuery.data ?? [];

  const statusCounts = useMemo(() => {
    return {
      all: allRows.length,
      pending: allRows.filter((row) => PENDING_STATUSES.includes(row.status))
        .length,
      active: allRows.filter((row) => ACTIVE_STATUSES.includes(row.status))
        .length,
      done: allRows.filter((row) => DONE_STATUSES.includes(row.status)).length,
    };
  }, [allRows]);

  const filtered = useMemo(
    () =>
      filterInspectionRepairs(allRows, {
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
    ? t('pages.hr.inspectionRepair.listTitle')
    : t('pages.hr.inspectionRepair.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.inspectionRepair.listDescription')
    : t('pages.hr.inspectionRepair.myListDescription');

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    setEmployeeId(undefined);
    setDateRange(null);
    resetPage();
  }

  function handleStatusMode(mode: InspectionRepairStatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(employeeId) ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  const columns: ColumnsType<InspectionRepairListItem> = useMemo(
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
              render: (_: unknown, row: InspectionRepairListItem) => (
                <div className="min-w-0">
                  <p className="erp-users-cell-strong m-0">
                    {formatInspectionRepairEmployeeName(row.employee)}
                  </p>
                  {row.employee?.email ? (
                    <p className="erp-users-email m-0 mt-0.5">
                      {row.employee.email}
                    </p>
                  ) : null}
                </div>
              ),
            } satisfies ColumnsType<InspectionRepairListItem>[number],
          ]
        : []),
      {
        title: t('hr.form.deviceName'),
        key: 'deviceName',
        width: isNarrow ? undefined : 200,
        ellipsis: true,
        render: (_: unknown, row: InspectionRepairListItem) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">
              {row.deviceName}
            </p>
            <p className="erp-users-cell-sub m-0 mt-0.5 truncate">
              {row.asset?.serialNumber ?? row.location}
              {isNarrow ? ` · ${row.requestNumber}` : ''}
            </p>
          </div>
        ),
      },
      {
        title: t('hr.form.inspectionType'),
        dataIndex: 'inspectionType',
        key: 'inspectionType',
        width: 130,
        responsive: ['lg'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">
            {t(`hr.inspectionType.${value}`)}
          </span>
        ),
      },
      {
        title: t('hr.table.urgency'),
        dataIndex: 'urgency',
        key: 'urgency',
        width: 110,
        responsive: ['lg'],
        render: (value: string) => (
          <span className="erp-users-role-tag">{t(`hr.urgency.${value}`)}</span>
        ),
      },
      {
        title: t('hr.table.createdDate'),
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 120,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">
            {formatProjectDate(value)}
          </span>
        ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: isNarrow ? 100 : 130,
        render: (value: InspectionRepairListItem['status']) => (
          <StatusBadge
            label={formatInspectionRepairStatus(value, t)}
            variant={inspectionRepairStatusVariant(value)}
          />
        ),
      },
    ],
    [canViewHr, isNarrow, t],
  );

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-inspection-repair-page ${LIST_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-inspection-repair-page ${LIST_PAGE_V2}`}>
      {importOpen ? (
        <ImportModal
          schema={inspectionRepairImportSchema}
          title={t('hr.exportImport.inspectionRepairs.title')}
          description={t('hr.exportImport.inspectionRepairs.description')}
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
            t('hr.messages.inspectionRepairLoadFailed'),
            t,
          )}
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <InspectionRepairStat
          label={t('pages.hr.inspectionRepair.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<ToolOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        <InspectionRepairStat
          label={t('pages.hr.inspectionRepair.stats.pending')}
          value={statusCounts.pending}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'pending'}
          onClick={() => handleStatusMode('pending')}
        />
        <InspectionRepairStat
          label={t('pages.hr.inspectionRepair.stats.active')}
          value={statusCounts.active}
          accent="blue"
          icon={<ToolOutlined />}
          active={statusMode === 'active'}
          onClick={() => handleStatusMode('active')}
        />
        <InspectionRepairStat
          label={t('pages.hr.inspectionRepair.stats.done')}
          value={statusCounts.done}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'done'}
          onClick={() => handleStatusMode('done')}
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
                  key: 'requests',
                  label: t('hr.exportImport.inspectionRepairs.export'),
                  filePrefix: 'inspection-repair',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildInspectionRepairExportSheets(filtered),
                },
              ]}
              onImport={canViewHr ? () => setImportOpen(true) : undefined}
              primary={{
                label: t('hr.buttons.newInspectionRepair'),
                onClick: () => router.push('/approvals/new/inspection-repair'),
              }}
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.inspectionRepair.searchPlaceholder')}
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
          <DataTable<InspectionRepairListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && rows.length === 0}
            scroll={{ x: isNarrow ? 560 : isCompact ? 860 : 1100 }}
            onRow={(record) => ({
              onClick: () =>
                router.push(`/hr/inspection-repair/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<ToolOutlined />}
                  title={
                    hasFilters
                      ? t('pages.hr.inspectionRepair.emptyFiltered')
                      : t('hr.empty.noInspectionRepairRequests')
                  }
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('hr.buttons.newInspectionRepair'),
                          onClick: () =>
                            router.push('/approvals/new/inspection-repair'),
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
