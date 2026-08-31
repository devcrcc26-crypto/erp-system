'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Input,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { Plane } from 'lucide-react';
import { tokens } from '@/lib/theme/tokens';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
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

/**
 * Company or personal flight application list — layout aligned with Leave Requests.
 */
export default function FlightApplicationsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();

  const statusOptions = useMemo(
    () => [
      { value: 'DRAFT', label: t('hr.status.DRAFT') },
      { value: 'SUBMITTED', label: t('hr.status.SUBMITTED') },
      { value: 'IN_REVIEW', label: t('hr.status.IN_REVIEW') },
      { value: 'APPROVED', label: t('hr.status.APPROVED') },
      { value: 'REJECTED', label: t('hr.status.REJECTED') },
      { value: 'RETURNED', label: t('hr.status.RETURNED') },
      { value: 'CANCELLED', label: t('hr.status.CANCELLED') },
    ],
    [t],
  );

  const canAccess = useCanAccessFlight();
  const canViewHr = useCanViewHr();
  const canCreate = useCanCreateFlight();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [listTab, setListTab] = useState<ListTab>('ALL');
  const [statusMode, setStatusMode] = useState<StatusMode>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FlightApplicationStatus[]>(
    [],
  );
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
      search: search.trim() || undefined,
      status:
        needsTicketTab
          ? undefined
          : statusFilter.length > 0
            ? statusFilter
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
      search,
      statusFilter,
      statusMode,
      internationalFilter,
      submittedById,
      dateRange,
      canViewHr,
      needsTicketTab,
    ],
  );

  const listQuery = useFlightApplications(
    listParams,
    canViewHr || canAccess,
  );

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
        render: (value: string) => (
          <span
            className="font-[family-name:var(--font-mono)] text-xs font-medium"
            style={{ color: tokens.colorPrimary }}
          >
            {value}
          </span>
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
                <div className="min-w-0 py-0.5">
                  <p
                    className="m-0 text-sm font-medium"
                    style={{ color: tokens.colorTextPrimary }}
                  >
                    {formatFlightSubmitterName(row.submitter)}
                  </p>
                  {row.submitter?.email ? (
                    <p
                      className="m-0 truncate text-xs"
                      style={{ color: tokens.colorTextTertiary }}
                    >
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
        width: 200,
        ellipsis: { showTitle: true },
        render: (_: unknown, row: FlightApplicationListItem) => (
          <div className="min-w-0">
            <p
              className="m-0 truncate text-sm"
              style={{ color: tokens.colorTextPrimary }}
            >
              {row.originCity}, {row.originCountry}
              <span
                className="mx-1"
                style={{ color: tokens.colorTextTertiary }}
              >
                →
              </span>
              {row.destination}
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
        render: (value: string) => formatProjectDate(value),
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
        render: (value: boolean) =>
          value ? (
            <Tag color="volcano">{t('hr.labels.international')}</Tag>
          ) : (
            <Tag>{t('hr.labels.domestic')}</Tag>
          ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
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
        responsive: ['lg'],
        render: (_: unknown, row: FlightApplicationListItem) => {
          const label = getCurrentStepLabel(row, t);
          if (!label || label === '—') {
            return (
              <span style={{ color: tokens.colorTextSecondary }}>—</span>
            );
          }
          const color =
            row.status === 'APPROVED'
              ? label === t('hr.labels.buyingTicket')
                ? 'orange'
                : label === t('hr.labels.completed')
                  ? 'green'
                  : 'blue'
              : 'blue';
          return <Tag color={color}>{label}</Tag>;
        },
      },
    ],
    [canViewHr, t],
  );

  function handleStatusMode(mode: StatusMode): void {
    setListTab('ALL');
    setStatusMode(mode);
    setStatusFilter([]);
    resetPage();
  }

  function handleNeedsTicketTab(): void {
    setListTab('NEEDS_TICKET');
    setStatusMode('all');
    setStatusFilter([]);
    resetPage();
  }

  function handleResetFilters(): void {
    setSearch('');
    setStatusFilter([]);
    setStatusMode('all');
    setInternationalFilter(undefined);
    setSubmittedById(undefined);
    setDateRange(null);
    resetPage();
  }

  const hasFilters =
    Boolean(search.trim()) ||
    statusFilter.length > 0 ||
    statusMode !== 'all' ||
    internationalFilter !== undefined ||
    submittedById !== undefined ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  if (!canAccess) {
    return (
      <div className="flex flex-col gap-4">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  const pageTitle = canViewHr
    ? t('pages.hr.flight.listTitle')
    : t('pages.hr.flight.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.flight.listDescription')
    : t('pages.hr.flight.myListDescription');

  const showSkeleton = listQuery.isLoading && !listQuery.data;

  if (showSkeleton) {
    return (
      <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
        <Spin />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : 'Failed to load flight applications'
          }
        />
      ) : null}

      <div
        className={`mb-1 grid grid-cols-2 gap-3 ${canViewHr ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}
      >
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('all')}
        >
          <StatCard
            label="Total"
            value={statusCounts.all}
            color="teal"
            icon={<Plane size={14} />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('pending')}
        >
          <StatCard
            label="Pending"
            value={statusCounts.pending}
            color="amber"
            icon={<ClockCircleOutlined />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('approved')}
        >
          <StatCard
            label="Approved"
            value={statusCounts.approved}
            color="green"
            icon={<CheckCircleOutlined />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('rejected')}
        >
          <StatCard
            label="Rejected"
            value={statusCounts.rejected}
            color="red"
            icon={<CloseCircleOutlined />}
          />
        </button>
        {canViewHr ? (
          <button
            type="button"
            className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
            onClick={handleNeedsTicketTab}
          >
            <StatCard
              label={t('hr.tabs.needsTicket')}
              value={statusCounts.needsTicket}
              color="blue"
              icon={<SendOutlined />}
            />
          </button>
        ) : null}
      </div>

      {canViewHr ? (
        <Tabs
          className="erp-list-tabs"
          activeKey={listTab}
          onChange={(key) => {
            setListTab(key as ListTab);
            if (key === 'ALL') {
              setStatusMode('all');
            }
            resetPage();
          }}
          items={[
            { key: 'ALL', label: t('hr.tabs.allApplications') },
            {
              key: 'NEEDS_TICKET',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {t('hr.tabs.needsTicket')}
                  {needsTicketCount > 0 ? (
                    <span
                      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                      style={{ background: tokens.colorAmber400 }}
                    >
                      {needsTicketCount > 99 ? '99+' : needsTicketCount}
                    </span>
                  ) : null}
                </span>
              ),
            },
          ]}
        />
      ) : null}

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4">
        <div className="erp-filter-bar">
          <ListSearchInput
            committedValue={search}
            onCommit={(value) => {
              setSearch(value);
              resetPage();
            }}
            placeholder={t('hr.placeholder.searchFlight')}
            className="w-full min-w-0 sm:w-72"
          />
          {!needsTicketTab ? (
            <Select
              mode="multiple"
              allowClear
              placeholder={t('hr.placeholder.status')}
              className="w-full min-w-0 sm:min-w-[180px] sm:w-auto"
              options={statusOptions}
              value={statusFilter}
              onChange={(value: FlightApplicationStatus[]) => {
                setStatusFilter(value);
                setStatusMode('all');
                resetPage();
              }}
              maxTagCount="responsive"
            />
          ) : null}
          <Select
            allowClear
            placeholder={`${t('hr.labels.international')} / ${t('hr.labels.domestic')}`}
            className="w-full min-w-0 sm:min-w-[180px] sm:w-auto"
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
              className="w-full min-w-0 sm:w-48"
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
            className="w-full min-w-0 sm:min-w-[260px] sm:w-auto"
            onChange={(value) => {
              setDateRange(value);
              resetPage();
            }}
          />
          <Button
            onClick={handleResetFilters}
            disabled={!hasFilters && listTab === 'ALL'}
            style={{ borderRadius: 0 }}
          >
            {t('common.reset')}
          </Button>
          <Tooltip title={t('common.refresh')}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={listQuery.isFetching && !listQuery.isLoading}
              onClick={() => void listQuery.refetch()}
              aria-label={t('common.refresh')}
              style={{ borderRadius: 0 }}
            />
          </Tooltip>
        </div>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Plane size={16} style={{ color: tokens.colorPrimary }} />
            <h3
              className="m-0 text-sm font-semibold"
              style={{ color: tokens.colorTextPrimary }}
            >
              {pageTitle}
            </h3>
            <span
              className="text-xs"
              style={{ color: tokens.colorTextTertiary }}
            >
              {totalCount}{' '}
              {totalCount === 1 ? 'application' : 'applications'}
            </span>
          </div>
          <Space wrap size={8}>
            {canCreate ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => router.push('/approvals/new/flight-application')}
                style={{ borderRadius: 0 }}
              >
                {t('hr.buttons.newFlightApplication')}
              </Button>
            ) : null}
          </Space>
        </div>

        <div className="px-0">
          <DataTable<FlightApplicationListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && !listQuery.isLoading}
            scroll={false}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/flight-applications/${record.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<Plane size={24} />}
                  title={t('hr.empty.noFlightApplications')}
                  description={pageDescription}
                  action={
                    hasFilters || listTab !== 'ALL'
                      ? {
                          label: t('common.reset'),
                          onClick: () => {
                            handleResetFilters();
                            setListTab('ALL');
                          },
                        }
                      : canCreate
                        ? {
                            label: t('hr.buttons.newFlightApplication'),
                            onClick: () =>
                              router.push('/approvals/new/flight-application'),
                          }
                        : undefined
                  }
                />
              ),
            }}
            
            pagination={{
              ...bindMeta(meta),
              pageSizeOptions: ['10', '20', '50', '100'],
            }}
          />
        </div>
      </div>
    </div>
  );
}
