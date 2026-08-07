'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Input, Select, Tabs, Tag } from 'antd';
import { SendOutlined, PlusOutlined } from '@ant-design/icons';
import { tokens } from '@/lib/theme/tokens';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
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

/**
 * Company or personal business trip list with filters.
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
  const { params, resetPage, bindMeta } = useTablePagination();

  const [listTab, setListTab] = useState<ListTab>('ALL');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BusinessTripStatus[]>([]);
  const [destinationCountry, setDestinationCountry] = useState('');
  const [submittedById, setSubmittedById] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  const needsTicketTab = listTab === 'NEEDS_TICKET' && canViewHr;

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      status:
        needsTicketTab || statusFilter.length === 0
          ? undefined
          : statusFilter,
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

  const columns: ColumnsType<BusinessTripListItem> = useMemo(
    () => [
      {
        title: t('hr.table.tripNumber'),
        dataIndex: 'tripNumber',
        key: 'tripNumber',
        width: 140,
      },
      ...(canViewHr
        ? [
            {
              title: t('hr.table.submittedBy'),
              key: 'submitter',
              render: (_: unknown, row: BusinessTripListItem) =>
                formatBusinessTripSubmitterName(row.submitter),
            } satisfies ColumnsType<BusinessTripListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.destination'),
        key: 'destination',
        render: (_: unknown, row: BusinessTripListItem) => (
          <span>
            {row.destinationCountry}
            {row.destinationCity ? (
              <>
                <span
                  style={{ margin: '0 4px', color: tokens.colorTextSecondary }}
                >
                  -
                </span>
                {row.destinationCity}
              </>
            ) : null}
          </span>
        ),
      },
      {
        title: t('hr.table.departure'),
        dataIndex: 'departureDate',
        key: 'departureDate',
        width: 120,
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.table.tripType'),
        dataIndex: 'tripType',
        key: 'tripType',
        width: 120,
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
        width: 100,
        align: 'center' as const,
      },
      {
        title: t('hr.table.estimatedTotal'),
        dataIndex: 'estimatedTotalCost',
        key: 'estimatedTotalCost',
        width: 140,
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
        width: 180,
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
                    style={{ cursor: 'pointer' }}
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
  if (!canAccess) {
    return (
      <Alert
        type="warning"
        showIcon
        message={t('pages.hr.accessDenied')}
      />
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div>
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : 'Failed to load business trips'
          }
        />
      ) : null}

      {canViewHr ? (
        <Tabs
          activeKey={listTab}
          onChange={(key) => {
            setListTab(key as ListTab);
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
          className="mb-2"
        />
      ) : null}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
        <ListSearchInput
          committedValue={search}
          onCommit={(value) => {
            setSearch(value);
            resetPage();
          }}
          placeholder={t('hr.placeholder.searchBusinessTrip')}
        />
        {!needsTicketTab ? (
          <Select
            mode="multiple"
            allowClear
            placeholder={t('hr.placeholder.status')}
            style={{ minWidth: 180 }}
            options={statusOptions}
            value={statusFilter}
            onChange={(value: BusinessTripStatus[]) => {
              setStatusFilter(value);
              resetPage();
            }}
          />
        ) : null}
        <Input
          allowClear
          placeholder={t('hr.form.destinationCountry')}
          style={{ width: 180 }}
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
            style={{ minWidth: 200 }}
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
          onChange={(value) => {
            setDateRange(value);
            resetPage();
          }}
        />
        <TableUpdatingIndicator active={listQuery.isFetching} />
        {canCreate ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            className="ml-auto"
            onClick={() => router.push('/approvals/new/business-trip')}
          >
            {t('hr.buttons.newBusinessTrip')}
          </Button>
        ) : null}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <DataTable<BusinessTripListItem>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isFetching}
          onRow={(record) => ({
            onClick: () => router.push(`/hr/business-trips/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<SendOutlined />}
                title={t('hr.empty.noBusinessTrips')}
              />
            ),
          }}
          pagination={bindMeta(meta)}
        />
      </div>
    </div>
  );
}
