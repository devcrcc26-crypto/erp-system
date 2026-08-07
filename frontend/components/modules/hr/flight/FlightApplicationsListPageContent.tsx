'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Select, Tabs, Tag } from 'antd';
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

  const columns: ColumnsType<FlightApplicationListItem> = useMemo(
    () => [
      {
        title: t('hr.table.applicationNumber'),
        dataIndex: 'applicationNumber',
        key: 'applicationNumber',
        width: 140,
      },
      ...(canViewHr
        ? [
            {
              title: t('hr.table.submittedBy'),
              key: 'submitter',
              render: (_: unknown, row: FlightApplicationListItem) =>
                formatFlightSubmitterName(row.submitter),
            } satisfies ColumnsType<FlightApplicationListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.route'),
        key: 'route',
        render: (_: unknown, row: FlightApplicationListItem) => (
          <span>
            {row.originCity}, {row.originCountry}
            <span style={{ margin: '0 4px', color: tokens.colorTextSecondary }}>
              to
            </span>
            {row.destination}
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
        title: t('hr.table.international'),
        dataIndex: 'isInternational',
        key: 'isInternational',
        width: 110,
        render: (value: boolean) =>
          value ? (
            <Tag color="volcano">{t('hr.labels.international')}</Tag>
          ) : (
            <Tag>{t('hr.labels.domestic')}</Tag>
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
        width: 180,
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
                    {t('hr.labels.attachTicket')}
                  </Tag>
                ) : null,
            } satisfies ColumnsType<FlightApplicationListItem>[number],
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
          placeholder={t('hr.placeholder.searchFlight')}
        />
        {!needsTicketTab ? (
          <Select
            mode="multiple"
            allowClear
            placeholder={t('hr.placeholder.status')}
            style={{ minWidth: 180 }}
            options={statusOptions}
            value={statusFilter}
            onChange={(value: FlightApplicationStatus[]) => {
              setStatusFilter(value);
              resetPage();
            }}
          />
        ) : null}
        <Select
          allowClear
          placeholder={`${t('hr.labels.international')} / ${t('hr.labels.domestic')}`}
          style={{ minWidth: 180 }}
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
            onClick={() => router.push('/approvals/new/flight-application')}
          >
            {t('hr.buttons.newFlightApplication')}
          </Button>
        ) : null}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
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
                title={t('hr.empty.noFlightApplications')}
              />
            ),
          }}
          pagination={bindMeta(meta)}
        />
      </div>
    </div>
  );
}
