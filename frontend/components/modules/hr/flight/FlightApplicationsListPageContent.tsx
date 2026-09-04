'use client';

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
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { Plane } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import {
  useCanAccessFlight,
  useCanCreateFlight,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  FlightApplicationListItem,
  FlightApplicationStatus,
} from '@/lib/api/flight.types';
import {
  useFlightApplications,
  useFlightNeedsTicketCount,
} from '@/lib/query/flight';
import { useUsersDirectory } from '@/lib/query/users';
import {
  flightStatusVariant,
  formatFlightStatus,
  formatFlightSubmitterName,
  formatTripType,
  getCurrentStepLabel,
  tripTypeVariant,
} from '@/lib/utils/flight-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

type ListTab = 'ALL' | 'NEEDS_TICKET';
type StatusMode = 'all' | 'pending' | 'approved' | 'rejected';

const PENDING_STATUSES: FlightApplicationStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
  'DRAFT',
];
const APPROVED_STATUSES: FlightApplicationStatus[] = ['APPROVED'];
const REJECTED_STATUSES: FlightApplicationStatus[] = ['REJECTED', 'CANCELLED'];

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
} as const;

function statusesForMode(mode: StatusMode): FlightApplicationStatus[] {
  switch (mode) {
    case 'pending':
      return PENDING_STATUSES;
    case 'approved':
      return APPROVED_STATUSES;
    case 'rejected':
      return REJECTED_STATUSES;
    default:
      return [];
  }
}

function FlightStat({
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
 * Flight applications list — Users chrome (stat bar, filter row, rounded table).
 */
export default function FlightApplicationsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;

  const canAccess = useCanAccessFlight();
  const canViewHr = useCanViewHr();
  const canCreate = useCanCreateFlight();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [listTab, setListTab] = useState<ListTab>('ALL');
  const [statusMode, setStatusMode] = useState<StatusMode>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [internationalFilter, setInternationalFilter] = useState<
    string | undefined
  >();
  const [submittedById, setSubmittedById] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  const needsTicketTab = listTab === 'NEEDS_TICKET' && canViewHr;

  const statsQuery = useFlightApplications(
    { page: 1, limit: 100 },
    canViewHr || canAccess,
  );

  const listParams = useMemo(
    () => ({
      ...params,
      search: appliedSearch.trim() || undefined,
      status: needsTicketTab
        ? undefined
        : statusesForMode(statusMode).length > 0
          ? statusesForMode(statusMode)
          : undefined,
      needsTicket: needsTicketTab ? true : undefined,
      isInternational:
        internationalFilter === 'true'
          ? true
          : internationalFilter === 'false'
            ? false
            : undefined,
      submittedById: canViewHr ? submittedById : undefined,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [
      params,
      appliedSearch,
      statusMode,
      internationalFilter,
      submittedById,
      dateRange,
      canViewHr,
      needsTicketTab,
    ],
  );

  const listQuery = useFlightApplications(listParams, canViewHr || canAccess);
  const needsTicketCountQuery = useFlightNeedsTicketCount(canViewHr);
  const needsTicketCount = needsTicketCountQuery.data ?? 0;

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;
  const totalCount = meta?.total ?? rows.length;

  const statusCounts = useMemo(() => {
    const allRows = statsQuery.data?.data ?? [];
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
      all: statsQuery.data?.meta?.total ?? allRows.length,
      pending,
      approved,
      rejected,
      needsTicket: needsTicketCount,
    };
  }, [statsQuery.data, needsTicketCount]);

  const columns: ColumnsType<FlightApplicationListItem> = useMemo(
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
      ...(canViewHr
        ? [
            {
              title: t('hr.table.submittedBy'),
              key: 'submitter',
              width: 200,
              responsive: ['md'],
              render: (_: unknown, row: FlightApplicationListItem) => (
                <div className="min-w-0">
                  <p className="erp-users-cell-strong m-0">
                    {formatFlightSubmitterName(row.submitter)}
                  </p>
                  {row.submitter?.email ? (
                    <p className="erp-users-email m-0 mt-0.5">
                      {row.submitter.email}
                    </p>
                  ) : null}
                </div>
              ),
            } satisfies ColumnsType<FlightApplicationListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.route'),
        key: 'route',
        ellipsis: true,
        render: (_: unknown, row: FlightApplicationListItem) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">
              {row.originCity}, {row.originCountry}
              <span className="mx-1 text-[#9ca3af]">→</span>
              {row.destination}
            </p>
            <p className="erp-users-cell-sub m-0 mt-0.5 md:hidden">
              {row.applicationNumber}
              {canViewHr
                ? ` · ${formatFlightSubmitterName(row.submitter)}`
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
        title: t('hr.table.international'),
        dataIndex: 'isInternational',
        key: 'isInternational',
        width: 110,
        responsive: ['lg'],
        render: (value: boolean) => (
          <span className="erp-users-role-tag">
            {value
              ? t('hr.labels.international')
              : t('hr.labels.domestic')}
          </span>
        ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: isNarrow ? 108 : 130,
        render: (value: FlightApplicationStatus) => (
          <StatusBadge
            label={formatFlightStatus(value, t)}
            variant={flightStatusVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.currentStep'),
        key: 'currentStep',
        width: 160,
        responsive: ['xl'],
        render: (_: unknown, row: FlightApplicationListItem) => {
          const label = getCurrentStepLabel(row, t);
          if (!label || label === '—') {
            return <span className="erp-users-cell-sub">—</span>;
          }
          return <span className="erp-users-role-tag">{label}</span>;
        },
      },
    ],
    [canViewHr, isNarrow, t],
  );

  function handleStatusMode(mode: StatusMode): void {
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
    setInternationalFilter(undefined);
    setSubmittedById(undefined);
    setDateRange(null);
    resetPage();
  }

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    listTab !== 'ALL' ||
    internationalFilter !== undefined ||
    submittedById !== undefined ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  const pageTitle = canViewHr
    ? t('pages.hr.flight.listTitle')
    : t('pages.hr.flight.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.flight.listDescription')
    : t('pages.hr.flight.myListDescription');

  if (!canAccess) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-flight-applications-page">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-flight-applications-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`erp-pro-list-page erp-users-page erp-flight-applications-page${canViewHr ? ' erp-flight-applications-page--hr' : ''}`}
    >
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('hr.messages.failedToLoadFlightApplications')
          }
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <FlightStat
          label={t('pages.hr.flight.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<Plane size={14} strokeWidth={2} />}
          active={listTab === 'ALL' && statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        <FlightStat
          label={t('pages.hr.flight.stats.pending')}
          value={statusCounts.pending}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={listTab === 'ALL' && statusMode === 'pending'}
          onClick={() => handleStatusMode('pending')}
        />
        <FlightStat
          label={t('pages.hr.flight.stats.approved')}
          value={statusCounts.approved}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={listTab === 'ALL' && statusMode === 'approved'}
          onClick={() => handleStatusMode('approved')}
        />
        <FlightStat
          label={t('pages.hr.flight.stats.rejected')}
          value={statusCounts.rejected}
          accent="red"
          icon={<CloseCircleOutlined />}
          active={listTab === 'ALL' && statusMode === 'rejected'}
          onClick={() => handleStatusMode('rejected')}
        />
        {canViewHr ? (
          <FlightStat
            label={t('hr.tabs.needsTicket')}
            value={statusCounts.needsTicket}
            accent="blue"
            icon={<SendOutlined />}
            active={listTab === 'NEEDS_TICKET'}
            onClick={handleNeedsTicketTab}
          />
        ) : null}
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">{pageTitle}</h3>
            <span className="erp-users-count-pill">
              {totalCount.toLocaleString()}
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
            {canCreate ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() =>
                  router.push('/approvals/new/flight-application')
                }
                aria-label={t('hr.buttons.newFlightApplication')}
              >
                {isNarrow
                  ? undefined
                  : t('hr.buttons.newFlightApplication')}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.flight.searchPlaceholder')}
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
            placeholder={`${t('hr.labels.international')} / ${t('hr.labels.domestic')}`}
            className="erp-users-filter-select"
            options={[
              { value: 'true', label: t('hr.labels.international') },
              { value: 'false', label: t('hr.labels.domestic') },
            ]}
            value={internationalFilter}
            onChange={(value: string | undefined) => {
              setInternationalFilter(value);
              resetPage();
            }}
          />
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
          <DataTable<FlightApplicationListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && rows.length === 0}
            scroll={{ x: isNarrow ? 520 : isCompact ? 720 : 1100 }}
            onRow={(record) => ({
              onClick: () =>
                router.push(`/hr/flight-applications/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<Plane size={28} strokeWidth={1.5} />}
                  title={
                    hasFilters
                      ? t('pages.hr.flight.emptyFiltered')
                      : t('hr.empty.noFlightApplications')
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
                            label: t('hr.buttons.newFlightApplication'),
                            onClick: () =>
                              router.push(
                                '/approvals/new/flight-application',
                              ),
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
