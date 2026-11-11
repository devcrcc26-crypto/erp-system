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
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { Globe } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import HrPersonCell from '@/components/modules/hr/shared/HrPersonCell';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanAccessBusinessTrip,
  useCanCreateBusinessTrip,
  useCanViewHr,
  useCanViewTeam,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  BusinessTripListItem,
  BusinessTripStatus,
} from '@/lib/api/business-trip.types';
import type { PaginationMeta } from '@/lib/api/types';
import {
  downloadBusinessTripImportTemplate,
  fetchBusinessTripDetails,
  useBusinessTripImport,
  useBusinessTripImportPreview,
  useBusinessTripsAll,
} from '@/lib/query/business-trip';
import { useUsersDirectory } from '@/lib/query/users';
import {
  businessTripStatusVariant,
  formatBusinessTripStatus,
  formatBusinessTripSubmitterName,
  formatTripType,
  getCurrentStepLabel,
  tripTypeVariant,
} from '@/lib/utils/business-trip-display';
import {
} from '@/lib/utils/business-trip-export-excel';
import {
  filterBusinessTrips,
  statusesForBusinessTripMode,
  type BusinessTripStatusMode,
} from '@/lib/utils/business-trip-list-filter';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName, teamEmployeeOptions } from '@/lib/utils/user-display';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import { buildBusinessTripExportSheets } from '@/lib/utils/business-trip-export';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
type ListTab = 'ALL' | 'NEEDS_TICKET';

const PENDING_STATUSES = statusesForBusinessTripMode('pending');
const APPROVED_STATUSES = statusesForBusinessTripMode('approved');
const REJECTED_STATUSES = statusesForBusinessTripMode('rejected');

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
} as const;

function BusinessTripStat({
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
 * Business trips list - Users chrome (stat bar, filter row, rounded table).
 * Search and filters run on the frontend against a full list fetch.
 */
export default function BusinessTripsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;

  const canAccess = useCanAccessBusinessTrip();
  const canViewHr = useCanViewHr();
  // Supervisors see their team's rows (backend-scoped); HR tools stay HR-only.
  const canViewTeam = useCanViewTeam();
  const canCreate = useCanCreateBusinessTrip();
  const importPreview = useBusinessTripImportPreview();
  const importCommit = useBusinessTripImport();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [listTab, setListTab] = useState<ListTab>('ALL');
  const [statusMode, setStatusMode] = useState<BusinessTripStatusMode>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [destinationCountry, setDestinationCountry] = useState('');
  const [submittedById, setSubmittedById] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);
  const [importOpen, setImportOpen] = useState(false);

  const needsTicketTab = listTab === 'NEEDS_TICKET' && canViewHr;

  const listQuery = useBusinessTripsAll(canViewHr || canAccess);

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
        : teamEmployeeOptions(allRows, (row) => row.submitter),
    [canViewHr, usersQuery.data, allRows],
  );

  const statusCounts = useMemo(() => {
    const pending = allRows.filter((row) =>
      PENDING_STATUSES.includes(row.status),
    ).length;
    const approved = allRows.filter((row) =>
      APPROVED_STATUSES.includes(row.status),
    ).length;
    const rejected = allRows.filter((row) =>
      REJECTED_STATUSES.includes(row.status),
    ).length;
    const needsTicket = allRows.filter(
      (row) => row.needsTicketAttachment === true,
    ).length;
    return {
      all: allRows.length,
      pending,
      approved,
      rejected,
      needsTicket,
    };
  }, [allRows]);

  const filtered = useMemo(
    () =>
      filterBusinessTrips(allRows, {
        search: appliedSearch,
        statusMode: needsTicketTab ? 'all' : statusMode,
        needsTicket: needsTicketTab || undefined,
        destinationCountry: destinationCountry.trim() || undefined,
        submittedById: canViewTeam ? submittedById : undefined,
        dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
        dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
      }),
    [
      allRows,
      appliedSearch,
      statusMode,
      needsTicketTab,
      destinationCountry,
      submittedById,
      dateRange,
      canViewTeam,
    ],
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

  const columns: ColumnsType<BusinessTripListItem> = useMemo(
    () => [
      {
        title: t('hr.table.tripNumber'),
        dataIndex: 'tripNumber',
        key: 'tripNumber',
        width: 130,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-id-chip">{value}</span>
        ),
      },
      ...(canViewTeam
        ? [
            {
              title: t('hr.table.submittedBy'),
              key: 'submitter',
              width: 200,
              responsive: ['md'],
              render: (_: unknown, row: BusinessTripListItem) => (
                <HrPersonCell
                  person={row.submitter}
                  name={formatBusinessTripSubmitterName(row.submitter)}
                />
              ),
            } satisfies ColumnsType<BusinessTripListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.destination'),
        key: 'destination',
        ellipsis: true,
        render: (_: unknown, row: BusinessTripListItem) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">
              {row.destinationCountry}
              {row.destinationCity ? ` · ${row.destinationCity}` : ''}
            </p>
            <p className="erp-users-cell-sub m-0 mt-0.5 md:hidden">
              {row.tripNumber}
              {canViewTeam
                ? ` · ${formatBusinessTripSubmitterName(row.submitter)}`
                : ''}
            </p>
            <p className="erp-users-cell-sub m-0 mt-0.5 md:hidden">
              {formatProjectDate(row.departureDate)}
            </p>
          </div>
        ),
      },
      {
        title: t('hr.table.departure'),
        dataIndex: 'departureDate',
        key: 'departureDate',
        width: 120,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">{formatProjectDate(value)}</span>
        ),
      },
      {
        title: t('hr.table.tripType'),
        dataIndex: 'tripType',
        key: 'tripType',
        width: 120,
        responsive: ['lg'],
        render: (value: string) => (
          <StatusBadge
            label={formatTripType(value, t)}
            variant={tripTypeVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: isNarrow ? 108 : 130,
        render: (value: BusinessTripStatus) => (
          <StatusBadge
            label={formatBusinessTripStatus(value, t)}
            variant={businessTripStatusVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.currentStep'),
        key: 'currentStep',
        width: 160,
        responsive: ['xl'],
        render: (_: unknown, row: BusinessTripListItem) => {
          const label = getCurrentStepLabel(row, t);
          if (!label || label === '-') {
            return <span className="erp-users-cell-sub">-</span>;
          }
          return <span className="erp-users-role-tag">{label}</span>;
        },
      },
    ],
    [canViewTeam, isNarrow, t],
  );

  function handleStatusMode(mode: BusinessTripStatusMode): void {
    setListTab('ALL');
    setStatusMode(mode);
    resetPage();
  }

  function handleNeedsTicketTab(): void {
    setListTab('NEEDS_TICKET');
    setStatusMode('all');
    resetPage();
  }

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    setListTab('ALL');
    setDestinationCountry('');
    setSubmittedById(undefined);
    setDateRange(null);
    resetPage();
  }



  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    listTab !== 'ALL' ||
    Boolean(destinationCountry.trim()) ||
    submittedById !== undefined ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  const pageTitle = canViewTeam
    ? t('pages.hr.businessTrip.listTitle')
    : t('pages.hr.businessTrip.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.businessTrip.listDescription')
    : canViewTeam
      ? t('pages.hr.teamListDescription')
      : t('pages.hr.businessTrip.myListDescription');

  if (!canAccess) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-business-trips-page ${LIST_PAGE_V2}`}>
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-business-trips-page ${LIST_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-business-trips-page${canViewHr ? ' erp-business-trips-page--hr' : ''} ${LIST_PAGE_V2}`}
    >
      {importOpen ? (
        <HrImportModal
          entity="businessTrips"
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            messageApi.success(summary);
            void listQuery.refetch();
          }}
          downloadTemplate={downloadBusinessTripImportTemplate}
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
              : t('hr.messages.failedToLoadBusinessTrips')
          }
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <BusinessTripStat
          label={t('pages.hr.businessTrip.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<Globe size={14} strokeWidth={2} />}
          active={listTab === 'ALL' && statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        <BusinessTripStat
          label={t('pages.hr.businessTrip.stats.pending')}
          value={statusCounts.pending}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={listTab === 'ALL' && statusMode === 'pending'}
          onClick={() => handleStatusMode('pending')}
        />
        <BusinessTripStat
          label={t('pages.hr.businessTrip.stats.approved')}
          value={statusCounts.approved}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={listTab === 'ALL' && statusMode === 'approved'}
          onClick={() => handleStatusMode('approved')}
        />
        <BusinessTripStat
          label={t('pages.hr.businessTrip.stats.rejected')}
          value={statusCounts.rejected}
          accent="red"
          icon={<CloseCircleOutlined />}
          active={listTab === 'ALL' && statusMode === 'rejected'}
          onClick={() => handleStatusMode('rejected')}
        />
        {canViewHr ? (
          <BusinessTripStat
            label={t('hr.tabs.needsTicket')}
            value={statusCounts.needsTicket}
            accent="blue"
            icon={<SendOutlined />}
            active={listTab === 'NEEDS_TICKET'}
            onClick={handleNeedsTicketTab}
          />
        ) : null}
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
                  key: 'export-trips',
                  label: t('pages.hr.businessTrip.exportTrips'),
                  filePrefix: 'business-trips',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildBusinessTripExportSheets(filtered),
                },
                {
                  key: 'export-passengers',
                  label: t('pages.hr.businessTrip.exportPassengers'),
                  filePrefix: 'business-trips-with-passengers',
                  disabled: filtered.length === 0,
                  buildSheets: async () =>
                    buildBusinessTripExportSheets(
                      filtered,
                      await fetchBusinessTripDetails(
                        filtered.map((row) => row.id),
                      ),
                    ),
                },
              ]}
              onImport={canViewHr ? () => setImportOpen(true) : undefined}
              primary={
                canCreate
                  ? {
                      label: t('hr.buttons.newBusinessTrip'),
                      onClick: () => router.push('/approvals/new/business-trip'),
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
            placeholder={t('pages.hr.businessTrip.searchPlaceholder')}
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
          <Input
            allowClear
            placeholder={t('hr.form.destinationCountry')}
            className="erp-users-filter-select"
            value={destinationCountry}
            onChange={(e) => {
              setDestinationCountry(e.target.value);
              resetPage();
            }}
            onClear={() => {
              setDestinationCountry('');
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
              value={submittedById}
              onChange={(value: string | undefined) => {
                setSubmittedById(value);
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
          <DataTable<BusinessTripListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && rows.length === 0}
            scroll={{ x: isNarrow ? 520 : isCompact ? 720 : 1100 }}
            onRow={(record) => ({
              onClick: () =>
                router.push(`/hr/business-trips/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<Globe size={28} strokeWidth={1.5} />}
                  title={
                    hasFilters
                      ? t('pages.hr.businessTrip.emptyFiltered')
                      : t('hr.empty.noBusinessTrips')
                  }
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : canCreate
                        ? {
                            label: t('hr.buttons.newBusinessTrip'),
                            onClick: () =>
                              router.push('/approvals/new/business-trip'),
                          }
                        : undefined
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
