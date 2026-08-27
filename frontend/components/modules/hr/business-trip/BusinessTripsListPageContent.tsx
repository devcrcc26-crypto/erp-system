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
import { Globe } from 'lucide-react';
import { tokens } from '@/lib/theme/tokens';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import SectionPageHeader from '@/components/ui/SectionPageHeader/SectionPageHeader';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import {
  useCanAccessBusinessTrip,
  useCanCreateBusinessTrip,
  useCanManageBusinessTrip,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  BusinessTripListItem,
  BusinessTripStatus,
} from '@/lib/api/business-trip.types';
import {
  useBusinessTripNeedsTicketCount,
  useBusinessTrips,
} from '@/lib/query/business-trip';
import { useUsersDirectory } from '@/lib/query/users';
import {
  businessTripStatusVariant,
  formatBusinessTripStatus,
  formatBusinessTripSubmitterName,
  formatEtb,
  formatTripType,
  getCurrentStepLabel,
  tripTypeVariant,
} from '@/lib/utils/business-trip-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

type ListTab = 'ALL' | 'NEEDS_TICKET';
type StatusMode = 'all' | 'pending' | 'approved' | 'rejected';

const PENDING_STATUSES: BusinessTripStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
  'DRAFT',
];
const APPROVED_STATUSES: BusinessTripStatus[] = ['APPROVED'];
const REJECTED_STATUSES: BusinessTripStatus[] = ['REJECTED', 'CANCELLED'];

function statusesForMode(mode: StatusMode): BusinessTripStatus[] {
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
 * Company or personal business trip list — layout aligned with Flight Applications.
 */
export default function BusinessTripsListPageContent(): React.ReactNode {
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

  const canAccess = useCanAccessBusinessTrip();
  const canViewHr = useCanViewHr();
  const canCreate = useCanCreateBusinessTrip();
  const canManage = useCanManageBusinessTrip();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [listTab, setListTab] = useState<ListTab>('ALL');
  const [statusMode, setStatusMode] = useState<StatusMode>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BusinessTripStatus[]>([]);
  const [destinationCountry, setDestinationCountry] = useState('');
  const [submittedById, setSubmittedById] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  const needsTicketTab = listTab === 'NEEDS_TICKET' && canViewHr;

  const statsQuery = useBusinessTrips(
    { page: 1, limit: 100 },
    canViewHr || canAccess,
  );

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      status: needsTicketTab
        ? undefined
        : statusFilter.length > 0
          ? statusFilter
          : statusesForMode(statusMode).length > 0
            ? statusesForMode(statusMode)
            : undefined,
      needsTicket: needsTicketTab ? true : undefined,
      destinationCountry: destinationCountry.trim() || undefined,
      submittedById: canViewHr ? submittedById : undefined,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [
      params,
      search,
      statusFilter,
      statusMode,
      destinationCountry,
      submittedById,
      dateRange,
      canViewHr,
      needsTicketTab,
    ],
  );

  const listQuery = useBusinessTrips(listParams, canViewHr || canAccess);

  const needsTicketCountQuery = useBusinessTripNeedsTicketCount(canViewHr);
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

  const columns: ColumnsType<BusinessTripListItem> = useMemo(
    () => [
      {
        title: t('hr.table.tripNumber'),
        dataIndex: 'tripNumber',
        key: 'tripNumber',
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
              render: (_: unknown, row: BusinessTripListItem) => (
                <div className="min-w-0 py-0.5">
                  <p
                    className="m-0 text-sm font-medium"
                    style={{ color: tokens.colorTextPrimary }}
                  >
                    {formatBusinessTripSubmitterName(row.submitter)}
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
            } satisfies ColumnsType<BusinessTripListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.destination'),
        key: 'destination',
        ellipsis: { showTitle: true },
        render: (_: unknown, row: BusinessTripListItem) => (
          <div className="min-w-0">
            <p
              className="m-0 truncate text-sm"
              style={{ color: tokens.colorTextPrimary }}
            >
              {row.destinationCountry}
              {row.destinationCity ? ` · ${row.destinationCity}` : ''}
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
        title: t('hr.table.passengers'),
        dataIndex: 'passengerCount',
        key: 'passengerCount',
        width: 90,
        align: 'center' as const,
        responsive: ['md'],
      },
      {
        title: t('hr.table.estimatedTotal'),
        dataIndex: 'estimatedTotalCost',
        key: 'estimatedTotalCost',
        width: 130,
        responsive: ['lg'],
        render: (value: number | null | undefined) => formatEtb(value),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
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
        responsive: ['lg'],
        render: (_: unknown, row: BusinessTripListItem) => {
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
      ...(canManage
        ? [
            {
              title: '',
              key: 'ticketAction',
              width: 110,
              render: (_: unknown, row: BusinessTripListItem) =>
                row.needsTicketAttachment ? (
                  <Tag
                    color="orange"
                    icon={<SendOutlined />}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/hr/business-trips/${row.id}`);
                    }}
                  >
                    {t('hr.labels.attachTicket')}
                  </Tag>
                ) : null,
            } satisfies ColumnsType<BusinessTripListItem>[number],
          ]
        : []),
    ],
    [canManage, canViewHr, router, t],
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
    setDestinationCountry('');
    setSubmittedById(undefined);
    setDateRange(null);
    resetPage();
  }

  const hasFilters =
    Boolean(search.trim()) ||
    statusFilter.length > 0 ||
    statusMode !== 'all' ||
    Boolean(destinationCountry.trim()) ||
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
    ? t('pages.hr.businessTrip.listTitle')
    : t('pages.hr.businessTrip.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.businessTrip.listDescription')
    : t('pages.hr.businessTrip.myListDescription');

  if (listQuery.isLoading && !listQuery.data) {
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
              : 'Failed to load business trips'
          }
        />
      ) : null}

      <SectionPageHeader
        title={pageTitle}
        description={pageDescription}
      />

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
            icon={<Globe size={14} />}
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
            { key: 'ALL', label: t('hr.tabs.allTrips') },
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
            placeholder={t('hr.placeholder.searchBusinessTrip')}
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
              onChange={(value: BusinessTripStatus[]) => {
                setStatusFilter(value);
                setStatusMode('all');
                resetPage();
              }}
              maxTagCount="responsive"
            />
          ) : null}
          <Input
            allowClear
            placeholder={t('hr.form.destinationCountry')}
            className="w-full min-w-0 sm:w-48"
            value={destinationCountry}
            onChange={(e) => {
              setDestinationCountry(e.target.value);
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
            <Globe size={16} style={{ color: tokens.colorPrimary }} />
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
              {totalCount} {totalCount === 1 ? 'trip' : 'trips'}
            </span>
          </div>
          <Space wrap size={8}>
            {canCreate ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => router.push('/approvals/new/business-trip')}
                style={{ borderRadius: 0 }}
              >
                {t('hr.buttons.newBusinessTrip')}
              </Button>
            ) : null}
          </Space>
        </div>

        <div className="px-0">
          <DataTable<BusinessTripListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && !listQuery.isLoading}
            scroll={false}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/business-trips/${record.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<Globe size={24} />}
                  title={t('hr.empty.noBusinessTrips')}
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
            }}
          />
        </div>
      </div>
    </div>
  );
}
