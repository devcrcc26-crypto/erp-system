'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Select, Tabs, Tag } from 'antd';
import { SendOutlined, PlusOutlined } from '@ant-design/icons';
import { tokens } from '@/lib/theme/tokens';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, {
  PageLoadingSkeleton,
} from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import {
  useCanAccessFlight,
  useCanCreateFlight,
  useCanManageFlight,
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
  FLIGHT_STATUS_OPTIONS,
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

/**
 * Company or personal flight application list with filters.
 */
export default function FlightApplicationsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const canAccess = useCanAccessFlight();
  const canViewHr = useCanViewHr();
  const canCreate = useCanCreateFlight();
  const canManage = useCanManageFlight();
  const { params, resetPage, bindMeta } = useTablePagination();

  const [listTab, setListTab] = useState<ListTab>('ALL');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FlightApplicationStatus[]>([]);
  const [internationalFilter, setInternationalFilter] = useState<
    string | undefined
  >();
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

  const columns: ColumnsType<FlightApplicationListItem> = [
    {
      title: 'Application #',
      dataIndex: 'applicationNumber',
      key: 'applicationNumber',
      width: 140,
    },
    ...(canViewHr
      ? [
          {
            title: 'Submitted by',
            key: 'submitter',
            render: (_: unknown, row: FlightApplicationListItem) =>
              formatFlightSubmitterName(row.submitter),
          } satisfies ColumnsType<FlightApplicationListItem>[number],
        ]
      : []),
    {
      title: 'Route',
      key: 'route',
      render: (_: unknown, row: FlightApplicationListItem) => (
        <span>
          {row.originCity}, {row.originCountry}
          <span style={{ margin: '0 4px', color: tokens.colorTextSecondary }}>to</span>
          {row.destination}
        </span>
      ),
    },
    {
      title: 'Departure',
      dataIndex: 'departureDate',
      key: 'departureDate',
      width: 120,
      render: (value: string) => formatProjectDate(value),
    },
    {
      title: 'Trip Type',
      dataIndex: 'tripType',
      key: 'tripType',
      width: 120,
      render: (value: string) => (
        <StatusBadge
          label={formatTripType(value)}
          variant={tripTypeVariant(value)}
        />
      ),
    },
    {
      title: 'International',
      dataIndex: 'isInternational',
      key: 'isInternational',
      width: 110,
      render: (value: boolean) =>
        value ? (
          <Tag color="volcano">International</Tag>
        ) : (
          <Tag>Domestic</Tag>
        ),
    },
    {
      title: 'Passengers',
      dataIndex: 'passengerCount',
      key: 'passengerCount',
      width: 100,
      align: 'center' as const,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value: FlightApplicationStatus) => (
        <StatusBadge
          label={formatFlightStatus(value)}
          variant={flightStatusVariant(value)}
        />
      ),
    },
    {
      title: 'Current Step',
      key: 'currentStep',
      width: 180,
      render: (_: unknown, row: FlightApplicationListItem) => {
        const label = getCurrentStepLabel(row);
        if (!label || label === '—') {
          return (
            <span style={{ color: tokens.colorTextSecondary }}>—</span>
          );
        }
        const color =
          row.status === 'APPROVED'
            ? label === 'Buying Ticket'
              ? 'orange'
              : label === 'Completed'
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
            render: (_: unknown, row: FlightApplicationListItem) =>
              row.needsTicketAttachment ? (
                <Tag
                  color="orange"
                  icon={<SendOutlined />}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/hr/flight-applications/${row.id}`);
                  }}
                >
                  Attach Ticket
                </Tag>
              ) : null,
          } satisfies ColumnsType<FlightApplicationListItem>[number],
        ]
      : []),
  ];

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
    <FormLayout
      title={
        canViewHr
          ? t('pages.hr.flight.listTitle')
          : t('pages.hr.flight.myListTitle')
      }
      description={
        canViewHr
          ? t('pages.hr.flight.listDescription')
          : t('pages.hr.flight.myListDescription')
      }
      extra={
        canCreate ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push('/approvals/new/flight-application')}
          >
            {t('pages.hr.flight.new')}
          </Button>
        ) : undefined
      }
    >
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : 'Failed to load flight applications'
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
            { key: 'ALL', label: 'All Applications' },
            {
              key: 'NEEDS_TICKET',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  Needs Ticket
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ListSearchInput
          committedValue={search}
          onCommit={(value) => {
            setSearch(value);
            resetPage();
          }}
          placeholder="Search application # or route"
        />
        {!needsTicketTab ? (
          <Select
            mode="multiple"
            allowClear
            placeholder="Status"
            style={{ minWidth: 180 }}
            options={FLIGHT_STATUS_OPTIONS}
            value={statusFilter}
            onChange={(value: FlightApplicationStatus[]) => {
              setStatusFilter(value);
              resetPage();
            }}
          />
        ) : null}
        <Select
          allowClear
          placeholder="International / Domestic"
          style={{ minWidth: 180 }}
          options={[
            { value: 'true', label: 'International' },
            { value: 'false', label: 'Domestic' },
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
            placeholder="Submitted by"
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
          placeholder={['Departure from', 'Departure to']}
          value={dateRange}
          onChange={(value) => {
            setDateRange(value);
            resetPage();
          }}
        />
        <TableUpdatingIndicator active={listQuery.isFetching} />
      </div>

      <DataTable<FlightApplicationListItem>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={listQuery.isFetching}
        onRow={(record) => ({
          onClick: () => router.push(`/hr/flight-applications/${record.id}`),
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: (
            <TableEmptyState
              icon={<SendOutlined />}
              title={
                needsTicketTab
                  ? 'No applications need tickets'
                  : 'No flight applications'
              }
              description={
                needsTicketTab
                  ? 'Approved applications awaiting ticket booking will appear here.'
                  : 'Submit a new flight application to start the approval process.'
              }
            />
          ),
        }}
        pagination={bindMeta(meta)}
      />
    </FormLayout>
  );
}
