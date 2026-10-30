'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/users/employees-v2.css';

import { useMemo, useState } from 'react';
import {
  Alert,
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
} from '@ant-design/icons';
import { Wallet } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import HrPersonCell from '@/components/modules/hr/shared/HrPersonCell';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import PerDiemSettlementsList from '@/components/modules/hr/per-diem/PerDiemSettlementsList';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr, useCanViewTeam } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  PerDiemRequestListItem,
  PerDiemStatus,
} from '@/lib/api/per-diem.types';
import type { PaginationMeta } from '@/lib/api/types';
import {
  downloadPerDiemRequestImportTemplate,
  usePerDiemRequestImport,
  usePerDiemRequestImportPreview,
  usePerDiemRequestsAll,
} from '@/lib/query/per-diem';
import { useUsersDirectory } from '@/lib/query/users';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import {
  formatPerDiemEmployeeName,
  formatPerDiemStatus,
  perDiemStatusVariant,
} from '@/lib/utils/per-diem-display';
import {
  DRAFT_STATUSES,
  filterPerDiemRequests,
  statusesForPerDiemMode,
  type PerDiemStatusMode,
} from '@/lib/utils/per-diem-list-filter';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName, teamEmployeeOptions } from '@/lib/utils/user-display';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import { buildPerDiemRequestExportSheets } from '@/lib/utils/per-diem-export';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
const PENDING_STATUSES = statusesForPerDiemMode('pending');
const APPROVED_STATUSES = statusesForPerDiemMode('approved');
const REJECTED_STATUSES = statusesForPerDiemMode('rejected');

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
} as const;

function PerDiemStat({
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
 * Per diem requests list - Users chrome (stat bar, filter row, rounded table).
 */
export default function PerDiemRequestsListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const canViewTeam = useCanViewTeam();
  const messageApi = useAppMessage();
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const importPreview = usePerDiemRequestImportPreview();
  const importCommit = usePerDiemRequestImport();

  const [statusMode, setStatusMode] = useState<PerDiemStatusMode>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);
  const [importOpen, setImportOpen] = useState(false);
  const [listTab, setListTab] = useState<'advances' | 'settlements'>('advances');

  const listQuery = usePerDiemRequestsAll(true);

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
      filterPerDiemRequests(allRows, {
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

  const columns = useMemo<ColumnsType<PerDiemRequestListItem>>(
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
      ...(canViewTeam
        ? ([
            {
              title: t('hr.table.employee'),
              key: 'employee',
              width: 200,
              responsive: ['md'],
              render: (_: unknown, row: PerDiemRequestListItem) => (
                <HrPersonCell
                  person={row.employee}
                  name={formatPerDiemEmployeeName(row.employee)}
                />
              ),
            },
          ] satisfies ColumnsType<PerDiemRequestListItem>)
        : []),
      {
        title: t('hr.table.destination'),
        key: 'destination',
        ellipsis: true,
        render: (_: unknown, row: PerDiemRequestListItem) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">
              {row.destination}
            </p>
            <p className="erp-users-cell-sub m-0 mt-0.5">
              {row.destinationCategory}
            </p>
            <p className="erp-users-cell-sub m-0 mt-0.5 md:hidden">
              {row.requestNumber}
              {canViewTeam
                ? ` · ${formatPerDiemEmployeeName(row.employee)}`
                : ''}
            </p>
          </div>
        ),
      },
      {
        title: t('hr.table.startDate'),
        key: 'dates',
        width: 190,
        responsive: ['md'],
        render: (_: unknown, row: PerDiemRequestListItem) => (
          <span className="erp-users-cell-sub">
            {formatProjectDate(row.startDate)} –{' '}
            {formatProjectDate(row.endDate)}
          </span>
        ),
      },
      {
        title: t('hr.table.days'),
        dataIndex: 'days',
        key: 'days',
        width: 70,
        align: 'center',
        responsive: ['lg'],
        render: (value: number) => (
          <span className="erp-users-cell-strong">{value}</span>
        ),
      },
      {
        title: t('hr.table.total'),
        dataIndex: 'totalAmountEtb',
        key: 'totalAmountEtb',
        width: 130,
        align: 'right',
        responsive: ['lg'],
        render: (value: number | string) => (
          <span className="erp-users-cell-strong">{formatEtbAmount(value)}</span>
        ),
      },
      {
        title: t('hr.table.paid'),
        key: 'paid',
        width: 110,
        responsive: ['lg'],
        render: (_: unknown, row: PerDiemRequestListItem) =>
          (row.disbursementCount ?? 0) > 0 ? (
            <span className="erp-users-cell-strong">
              {t('pages.hr.perDiem.disbursed')}
            </span>
          ) : row.status === 'APPROVED' || row.status === 'ACTIVE' ? (
            <span className="erp-users-cell-sub">
              {t('pages.hr.perDiem.unpaid')}
            </span>
          ) : (
            <span className="erp-users-cell-sub">-</span>
          ),
      },
      {
        title: t('pages.hr.perDiem.settled'),
        key: 'settled',
        width: 140,
        responsive: ['lg'],
        render: (_: unknown, row: PerDiemRequestListItem) =>
          row.settlement?.requestNumber ? (
            <span className="erp-users-id-chip">{row.settlement.requestNumber}</span>
          ) : (
            <span className="erp-users-cell-sub">-</span>
          ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: isNarrow ? 108 : 130,
        render: (value: PerDiemStatus) => (
          <StatusBadge
            label={formatPerDiemStatus(value, t)}
            variant={perDiemStatusVariant(value)}
          />
        ),
      },
    ],
    [canViewTeam, isNarrow, t],
  );


  function handleStatusMode(mode: PerDiemStatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    setEmployeeId(undefined);
    setDateRange(null);
    resetPage();
  }

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    employeeId !== undefined ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  const pageTitle = canViewTeam
    ? t('pages.hr.perDiem.listTitle')
    : t('pages.hr.perDiem.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.perDiem.listDescription')
    : canViewTeam
      ? t('pages.hr.teamListDescription')
      : t('pages.hr.perDiem.myListDescription');

  const listTabs = (
    <div className="erp-hr-travel-tabbar-card">
      <div
        className="erp-hr-travel-tabbar"
        role="tablist"
        aria-label={pageTitle}
      >
        <button
          type="button"
          role="tab"
          aria-selected={listTab === 'advances'}
          onClick={() => setListTab('advances')}
        >
          {t('pages.hr.perDiem.advancesTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={listTab === 'settlements'}
          onClick={() => setListTab('settlements')}
        >
          {t('pages.hr.perDiem.settlementsTab')}
        </button>
      </div>
    </div>
  );

  if (listTab === 'settlements') {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-per-diem-page ${LIST_PAGE_V2}`}>
        {listTabs}
        <PerDiemSettlementsList />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-per-diem-page ${LIST_PAGE_V2}`}>
        {listTabs}
        <div className="erp-pro-card flex justify-center p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-per-diem-page ${LIST_PAGE_V2}`}>
      {listTabs}
      {importOpen ? (
        <HrImportModal
          entity="perDiemRequests"
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            messageApi.success(summary);
            void listQuery.refetch();
          }}
          downloadTemplate={downloadPerDiemRequestImportTemplate}
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
              : t('hr.messages.failedToLoadPerDiemRequests')
          }
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <PerDiemStat
          label={t('pages.hr.perDiem.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<Wallet size={14} strokeWidth={2} />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        {!canViewHr ? (
          <PerDiemStat
            label={t('pages.hr.perDiem.stats.draft')}
            value={statusCounts.draft}
            accent="blue"
            icon={<FormOutlined />}
            active={statusMode === 'draft'}
            onClick={() => handleStatusMode('draft')}
          />
        ) : null}
        <PerDiemStat
          label={t('pages.hr.perDiem.stats.pending')}
          value={statusCounts.pending}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'pending'}
          onClick={() => handleStatusMode('pending')}
        />
        <PerDiemStat
          label={t('pages.hr.perDiem.stats.approved')}
          value={statusCounts.approved}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'approved'}
          onClick={() => handleStatusMode('approved')}
        />
        <PerDiemStat
          label={t('pages.hr.perDiem.stats.rejected')}
          value={statusCounts.rejected}
          accent="red"
          icon={<CloseCircleOutlined />}
          active={statusMode === 'rejected'}
          onClick={() => handleStatusMode('rejected')}
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
                  key: 'export',
                  label: undefined,
                  filePrefix: 'per-diem-requests',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildPerDiemRequestExportSheets(filtered),
                },
              ]}
              onImport={canViewHr ? () => setImportOpen(true) : undefined}
              primary={
                {
                  label: t('hr.buttons.newPerDiem'),
                  onClick: () => router.push('/approvals/new/per-diem'),
                }
              }
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.perDiem.searchPlaceholder')}
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
          <DataTable<PerDiemRequestListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && rows.length === 0}
            scroll={{ x: isNarrow ? 520 : isCompact ? 720 : 1000 }}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/per-diem/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<Wallet size={28} strokeWidth={1.5} />}
                  title={
                    hasFilters
                      ? t('pages.hr.perDiem.emptyFiltered')
                      : t('hr.empty.noPerDiemRequests')
                  }
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('hr.buttons.newPerDiem'),
                          onClick: () =>
                            router.push('/approvals/new/per-diem'),
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
