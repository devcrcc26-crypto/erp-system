'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Select,
  Space,
  Spin,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Wallet } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  PerDiemRequestListItem,
  PerDiemStatus,
} from '@/lib/api/per-diem.types';
import { usePerDiemRequests } from '@/lib/query/per-diem';
import { useUsersDirectory } from '@/lib/query/users';
import { tokens } from '@/lib/theme/tokens';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import {
  formatPerDiemEmployeeName,
  formatPerDiemStatus,
  perDiemStatusVariant,
} from '@/lib/utils/per-diem-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

type StatusMode = 'all' | 'pending' | 'approved' | 'rejected';

const PENDING_STATUSES: PerDiemStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];
const APPROVED_STATUSES: PerDiemStatus[] = ['APPROVED'];
const REJECTED_STATUSES: PerDiemStatus[] = ['REJECTED', 'CANCELLED'];

function statusesForMode(mode: StatusMode): PerDiemStatus[] {
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
 * Company or personal per diem request list — layout aligned with Business Trips.
 */
export default function PerDiemRequestsListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination(10);

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

  const [statusMode, setStatusMode] = useState<StatusMode>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PerDiemStatus[]>([]);
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  const statsQuery = usePerDiemRequests({ page: 1, limit: 500 }, true);

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      status:
        statusFilter.length > 0
          ? statusFilter
          : statusesForMode(statusMode).length > 0
            ? statusesForMode(statusMode)
            : undefined,
      employeeId: canViewHr ? employeeId : undefined,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [params, search, statusFilter, statusMode, employeeId, dateRange, canViewHr],
  );

  const listQuery = usePerDiemRequests(listParams, true);

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
    };
  }, [statsQuery.data]);

  const columns: ColumnsType<PerDiemRequestListItem> = useMemo(
    () => [
      {
        title: t('hr.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 120,
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
              title: t('hr.table.employee'),
              key: 'employee',
              width: 200,
              responsive: ['md'],
              render: (_: unknown, row: PerDiemRequestListItem) => (
                <div className="min-w-0 py-0.5">
                  <p
                    className="m-0 text-sm font-medium"
                    style={{ color: tokens.colorTextPrimary }}
                  >
                    {formatPerDiemEmployeeName(row.employee)}
                  </p>
                  {row.employee?.email ? (
                    <p
                      className="m-0 truncate text-xs"
                      style={{ color: tokens.colorTextTertiary }}
                    >
                      {row.employee.email}
                    </p>
                  ) : null}
                </div>
              ),
            } satisfies ColumnsType<PerDiemRequestListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.destination'),
        key: 'destination',
        ellipsis: { showTitle: true },
        render: (_: unknown, row: PerDiemRequestListItem) => (
          <div className="min-w-0">
            <p
              className="m-0 truncate text-sm font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {row.destination}
            </p>
            <p
              className="m-0 truncate text-xs"
              style={{ color: tokens.colorTextTertiary }}
            >
              {row.destinationCategory}
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
          <span className="text-sm">
            {formatProjectDate(row.startDate)} – {formatProjectDate(row.endDate)}
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
      },
      {
        title: t('hr.table.total'),
        dataIndex: 'totalAmountEtb',
        key: 'totalAmountEtb',
        width: 130,
        align: 'right',
        responsive: ['lg'],
        render: (value: number) => (
          <span className="font-medium">{formatEtbAmount(value)}</span>
        ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: PerDiemStatus) => (
          <StatusBadge
            label={formatPerDiemStatus(value, t)}
            variant={perDiemStatusVariant(value)}
          />
        ),
      },
    ],
    [canViewHr, t],
  );

  function handleStatusMode(mode: StatusMode): void {
    setStatusMode(mode);
    setStatusFilter([]);
    resetPage();
  }

  function handleResetFilters(): void {
    setSearch('');
    setStatusFilter([]);
    setStatusMode('all');
    setEmployeeId(undefined);
    setDateRange(null);
    resetPage();
  }

  const hasFilters =
    Boolean(search.trim()) ||
    statusFilter.length > 0 ||
    statusMode !== 'all' ||
    employeeId !== undefined ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  const pageTitle = canViewHr
    ? t('pages.hr.perDiem.listTitle')
    : t('pages.hr.perDiem.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.perDiem.listDescription')
    : t('pages.hr.perDiem.myListDescription');

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
              : 'Failed to load per diem requests'
          }
        />
      ) : null}

      <div>
        <h1
          className="m-0 text-xl font-semibold tracking-tight"
          style={{
            color: tokens.colorTextPrimary,
            fontFamily: tokens.fontFamily,
          }}
        >
          {pageTitle}
        </h1>
        <p
          className="mb-0 mt-1 text-sm"
          style={{ color: tokens.colorTextSecondary }}
        >
          {pageDescription}
        </p>
      </div>

      <div className="mb-1 grid grid-cols-2 gap-3 md:grid-cols-4">
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('all')}
        >
          <StatCard
            label={t('pages.approvals.stats.total')}
            value={statusCounts.all}
            color="teal"
            icon={<Wallet size={14} />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('pending')}
        >
          <StatCard
            label={t('pages.approvals.stats.pending')}
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
            label={t('pages.approvals.stats.approved')}
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
            label={t('pages.approvals.stats.rejected')}
            value={statusCounts.rejected}
            color="red"
            icon={<CloseCircleOutlined />}
          />
        </button>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4">
        <div className="erp-filter-bar">
          <ListSearchInput
            committedValue={search}
            onCommit={(value) => {
              setSearch(value);
              resetPage();
            }}
            placeholder={t('hr.placeholder.searchPerDiem')}
            className="w-full min-w-0 sm:w-72"
          />
          <Select
            mode="multiple"
            allowClear
            placeholder={t('hr.placeholder.status')}
            className="w-full min-w-0 sm:min-w-[180px] sm:w-auto"
            options={statusOptions}
            value={statusFilter}
            onChange={(value: PerDiemStatus[]) => {
              setStatusFilter(value);
              setStatusMode('all');
              resetPage();
            }}
            maxTagCount="responsive"
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
              value={employeeId}
              onChange={(value: string | undefined) => {
                setEmployeeId(value);
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
            disabled={!hasFilters}
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
            <WalletOutlined style={{ color: tokens.colorPrimary, fontSize: 16 }} />
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
              {totalCount === 1
                ? t('pages.hr.perDiem.requestSingular')
                : t('pages.hr.perDiem.requestPlural')}
            </span>
          </div>
          <Space wrap size={8}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/approvals/new/per-diem')}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.newPerDiem')}
            </Button>
          </Space>
        </div>

        <div className="px-0">
          <DataTable<PerDiemRequestListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && !listQuery.isLoading}
            scroll={false}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/per-diem/${record.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<Wallet size={24} />}
                  title={t('hr.empty.noPerDiemRequests')}
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('hr.buttons.newPerDiem'),
                          onClick: () => router.push('/approvals/new/per-diem'),
                        }
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
