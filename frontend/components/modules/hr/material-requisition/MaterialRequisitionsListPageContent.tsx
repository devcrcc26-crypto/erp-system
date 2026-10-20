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
  InboxOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type { MaterialRequisitionListItem } from '@/lib/api/material-requisition.types';
import type { PaginationMeta } from '@/lib/api/types';
import {
  downloadMaterialRequisitionImportTemplate,
  fetchMaterialRequisitionDetails,
  useMaterialRequisitionImport,
  useMaterialRequisitionImportPreview,
  useMaterialRequisitionsAll,
} from '@/lib/query/material-requisition';
import { useUsersDirectory } from '@/lib/query/users';
import {
  formatMaterialRequisitionEmployeeName,
  formatMaterialRequisitionStatus,
  materialRequisitionStatusVariant,
} from '@/lib/utils/material-requisition-display';
import {
  DRAFT_STATUSES,
  filterMaterialRequisitions,
  statusesForMaterialRequisitionMode,
  type MaterialRequisitionStatusMode,
} from '@/lib/utils/material-requisition-list-filter';
import {
} from '@/lib/utils/material-requisition-export-excel';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import { buildMaterialRequisitionExportSheets } from '@/lib/utils/requisition-export';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
const PENDING_STATUSES = statusesForMaterialRequisitionMode('pending');
const APPROVED_STATUSES = statusesForMaterialRequisitionMode('approved');
const REJECTED_STATUSES = statusesForMaterialRequisitionMode('rejected');

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
} as const;

function MaterialRequisitionStat({
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
 * Material requisitions list - Users chrome (stat bar, filter row, rounded table).
 */
export default function MaterialRequisitionsListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const messageApi = useAppMessage();
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const importPreview = useMaterialRequisitionImportPreview();
  const importCommit = useMaterialRequisitionImport();

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] =
    useState<MaterialRequisitionStatusMode>('all');
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);
  const [importOpen, setImportOpen] = useState(false);

  const listQuery = useMaterialRequisitionsAll({}, true);

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
      filterMaterialRequisitions(allRows, {
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
    ? t('pages.hr.materialRequisition.listTitle')
    : t('pages.hr.materialRequisition.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.materialRequisition.listDescription')
    : t('pages.hr.materialRequisition.myListDescription');

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    setEmployeeId(undefined);
    setDateRange(null);
    resetPage();
  }

  function handleStatusMode(mode: MaterialRequisitionStatusMode): void {
    setStatusMode(mode);
    resetPage();
  }



  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(employeeId) ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  const columns: ColumnsType<MaterialRequisitionListItem> = useMemo(
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
              render: (_: unknown, row: MaterialRequisitionListItem) => (
                <div className="min-w-0">
                  <p className="erp-users-cell-strong m-0">
                    {formatMaterialRequisitionEmployeeName(row.employee)}
                  </p>
                  {row.employee?.email ? (
                    <p className="erp-users-email m-0 mt-0.5">
                      {row.employee.email}
                    </p>
                  ) : null}
                </div>
              ),
            } satisfies ColumnsType<MaterialRequisitionListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.title'),
        key: 'title',
        ellipsis: true,
        render: (_: unknown, row: MaterialRequisitionListItem) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">{row.title}</p>
            <p className="erp-users-cell-sub m-0 mt-0.5 md:hidden">
              {row.requestNumber}
              {canViewHr
                ? ` · ${formatMaterialRequisitionEmployeeName(row.employee)}`
                : ''}
            </p>
          </div>
        ),
      },
      {
        title: t('hr.table.items'),
        dataIndex: 'itemCount',
        key: 'itemCount',
        width: 80,
        align: 'right',
        responsive: ['lg'],
        render: (value: number) => (
          <span className="erp-users-cell-sub tabular-nums">{value}</span>
        ),
      },
      {
        title: t('hr.table.requiredBy'),
        dataIndex: 'requiredByDate',
        key: 'requiredByDate',
        width: 120,
        responsive: ['xl'],
        render: (value: string | null | undefined) => (
          <span className="erp-users-cell-sub">
            {value ? formatProjectDate(value) : '-'}
          </span>
        ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: isNarrow ? 108 : 130,
        render: (value: MaterialRequisitionListItem['status']) => (
          <StatusBadge
            label={formatMaterialRequisitionStatus(value, t)}
            variant={materialRequisitionStatusVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.currentTier'),
        dataIndex: 'currentTierLabel',
        key: 'currentTierLabel',
        width: 140,
        responsive: ['xl'],
        ellipsis: true,
        render: (value: string | null | undefined) =>
          value ? (
            <span className="erp-users-role-tag">{value}</span>
          ) : (
            <span className="erp-users-cell-sub">-</span>
          ),
      },
    ],
    [canViewHr, isNarrow, t],
  );

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-material-requisitions-page ${LIST_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-material-requisitions-page ${LIST_PAGE_V2}`}>
      {importOpen ? (
        <HrImportModal
          entity="materialRequisitions"
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            messageApi.success(summary);
            void listQuery.refetch();
          }}
          downloadTemplate={downloadMaterialRequisitionImportTemplate}
          previewMutation={importPreview}
          commitMutation={importCommit}
        />
      ) : null}

      {listQuery.isError ? (
        <ErpNotice
          tone="error"
          className="mb-4"
          title={getFriendlyApiErrorMessage(
            listQuery.error,
            t('hr.messages.failedToLoadMaterialRequisitions'),
            t,
          )}
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <MaterialRequisitionStat
          label={t('pages.hr.materialRequisition.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<InboxOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        {!canViewHr ? (
          <MaterialRequisitionStat
            label={t('pages.hr.materialRequisition.stats.draft')}
            value={statusCounts.draft}
            accent="blue"
            icon={<FormOutlined />}
            active={statusMode === 'draft'}
            onClick={() => handleStatusMode('draft')}
          />
        ) : null}
        <MaterialRequisitionStat
          label={t('pages.hr.materialRequisition.stats.pending')}
          value={statusCounts.pending}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'pending'}
          onClick={() => handleStatusMode('pending')}
        />
        <MaterialRequisitionStat
          label={t('pages.hr.materialRequisition.stats.approved')}
          value={statusCounts.approved}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'approved'}
          onClick={() => handleStatusMode('approved')}
        />
        <MaterialRequisitionStat
          label={t('pages.hr.materialRequisition.stats.rejected')}
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
                  key: 'export-requisitions',
                  label: t('pages.hr.materialRequisition.exportRequisitions'),
                  filePrefix: 'material-requisitions',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildMaterialRequisitionExportSheets(filtered),
                },
                {
                  key: 'export-items',
                  label: t('pages.hr.materialRequisition.exportItems'),
                  filePrefix: 'material-requisitions-with-items',
                  disabled: filtered.length === 0,
                  buildSheets: async () =>
                    buildMaterialRequisitionExportSheets(
                      filtered,
                      await fetchMaterialRequisitionDetails(
                        filtered.map((row) => row.id),
                      ),
                    ),
                },
              ]}
              onImport={canViewHr ? () => setImportOpen(true) : undefined}
              primary={
                {
                  label: t('hr.buttons.newMaterialRequisition'),
                  onClick: () => router.push('/approvals/new/material-requisition'),
                }
              }
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.materialRequisition.searchPlaceholder')}
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
          <DataTable<MaterialRequisitionListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && rows.length === 0}
            scroll={{ x: isNarrow ? 520 : isCompact ? 720 : 1000 }}
            onRow={(record) => ({
              onClick: () =>
                router.push(`/hr/material-requisition/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<InboxOutlined />}
                  title={
                    hasFilters
                      ? t('pages.hr.materialRequisition.emptyFiltered')
                      : t('hr.empty.noMaterialRequisitions')
                  }
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('hr.buttons.newMaterialRequisition'),
                          onClick: () =>
                            router.push('/approvals/new/material-requisition'),
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
