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
  ToolOutlined,
} from '@ant-design/icons';
import { Wrench } from 'lucide-react';
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
  InspectionRepairListItem,
  InspectionRepairStatus,
} from '@/lib/api/inspection-repair.types';
import { useInspectionRepairs } from '@/lib/query/inspection-repair';
import { useUsersDirectory } from '@/lib/query/users';
import { tokens } from '@/lib/theme/tokens';
import {
  formatInspectionRepairEmployeeName,
  formatInspectionRepairStatus,
  inspectionRepairStatusVariant,
} from '@/lib/utils/inspection-repair-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

type StatusMode = 'all' | 'pending' | 'active' | 'done';

const PENDING_STATUSES: InspectionRepairStatus[] = ['DRAFT', 'SUBMITTED'];
const ACTIVE_STATUSES: InspectionRepairStatus[] = ['IN_REPAIR'];
const DONE_STATUSES: InspectionRepairStatus[] = ['REPAIRED', 'REJECTED'];

function statusesForMode(mode: StatusMode): InspectionRepairStatus[] {
  switch (mode) {
    case 'pending':
      return PENDING_STATUSES;
    case 'active':
      return ACTIVE_STATUSES;
    case 'done':
      return DONE_STATUSES;
    default:
      return [];
  }
}

export default function InspectionRepairListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [statusMode, setStatusMode] = useState<StatusMode>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InspectionRepairStatus[]>([]);
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const statusOptions = useMemo(
    () => [
      { value: 'DRAFT', label: t('hr.status.DRAFT') },
      { value: 'SUBMITTED', label: t('hr.status.SUBMITTED') },
      { value: 'IN_REPAIR', label: t('hr.status.IN_REPAIR') },
      { value: 'REPAIRED', label: t('hr.status.REPAIRED') },
      { value: 'REJECTED', label: t('hr.status.REJECTED') },
    ],
    [t],
  );

  const countsBaseParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      employeeId: canViewHr ? employeeId : undefined,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [search, canViewHr, employeeId, dateRange],
  );

  const listParams = useMemo(
    () => ({
      ...params,
      ...countsBaseParams,
      status:
        statusFilter.length > 0
          ? statusFilter
          : statusesForMode(statusMode).length > 0
            ? statusesForMode(statusMode)
            : undefined,
    }),
    [params, countsBaseParams, statusFilter, statusMode],
  );

  const listQuery = useInspectionRepairs(listParams, true);
  const totalCountQuery = useInspectionRepairs(
    { page: 1, limit: 1, ...countsBaseParams },
    true,
  );
  const pendingCountQuery = useInspectionRepairs(
    { page: 1, limit: 1, status: PENDING_STATUSES, ...countsBaseParams },
    true,
  );
  const activeCountQuery = useInspectionRepairs(
    { page: 1, limit: 1, status: ACTIVE_STATUSES, ...countsBaseParams },
    true,
  );
  const doneCountQuery = useInspectionRepairs(
    { page: 1, limit: 1, status: DONE_STATUSES, ...countsBaseParams },
    true,
  );
  const usersQuery = useUsersDirectory({ page: 1, limit: 100 }, { enabled: canViewHr });

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;
  const totalCount = meta?.total ?? rows.length;

  const statusCounts = {
    all: totalCountQuery.data?.meta?.total ?? totalCount,
    pending: pendingCountQuery.data?.meta?.total ?? 0,
    active: activeCountQuery.data?.meta?.total ?? 0,
    done: doneCountQuery.data?.meta?.total ?? 0,
  };

  const columns: ColumnsType<InspectionRepairListItem> = useMemo(
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
              render: (_: unknown, row: InspectionRepairListItem) => (
                <div className="min-w-0 py-0.5">
                  <p className="m-0 text-sm font-medium" style={{ color: tokens.colorTextPrimary }}>
                    {formatInspectionRepairEmployeeName(row.employee)}
                  </p>
                  {row.employee?.email ? (
                    <p className="m-0 truncate text-xs" style={{ color: tokens.colorTextTertiary }}>
                      {row.employee.email}
                    </p>
                  ) : null}
                </div>
              ),
            } satisfies ColumnsType<InspectionRepairListItem>[number],
          ]
        : []),
      {
        title: t('hr.form.deviceName'),
        key: 'deviceName',
        render: (_: unknown, row: InspectionRepairListItem) => (
          <div className="min-w-0">
            <p className="m-0 truncate text-sm font-medium" style={{ color: tokens.colorTextPrimary }}>
              {row.deviceName}
            </p>
            <p className="m-0 truncate text-xs" style={{ color: tokens.colorTextTertiary }}>
              {row.asset?.serialNumber ?? row.location}
            </p>
          </div>
        ),
      },
      {
        title: t('hr.form.inspectionType'),
        dataIndex: 'inspectionType',
        key: 'inspectionType',
        width: 130,
        responsive: ['lg'],
        render: (value: string) => t(`hr.inspectionType.${value}`),
      },
      {
        title: t('hr.table.urgency'),
        dataIndex: 'urgency',
        key: 'urgency',
        width: 110,
        responsive: ['lg'],
        render: (value: string) => t(`hr.urgency.${value}`),
      },
      {
        title: t('hr.table.createdDate'),
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 120,
        responsive: ['md'],
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: InspectionRepairStatus) => (
          <StatusBadge
            label={formatInspectionRepairStatus(value, t)}
            variant={inspectionRepairStatusVariant(value)}
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
    ? t('pages.hr.inspectionRepair.listTitle')
    : t('pages.hr.inspectionRepair.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.inspectionRepair.listDescription')
    : t('pages.hr.inspectionRepair.myListDescription');

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
              : t('hr.messages.inspectionRepairLoadFailed')
          }
        />
      ) : null}

      <div>
        <h1
          className="m-0 text-xl font-semibold tracking-tight"
          style={{ color: tokens.colorTextPrimary, fontFamily: tokens.fontFamily }}
        >
          {pageTitle}
        </h1>
        <p className="mb-0 mt-1 text-sm" style={{ color: tokens.colorTextSecondary }}>
          {pageDescription}
        </p>
      </div>

      <div className="mb-1 grid grid-cols-2 gap-3 md:grid-cols-4">
        <button type="button" className="m-0 w-full border-0 bg-transparent p-0 text-left" onClick={() => handleStatusMode('all')}>
          <StatCard label={t('pages.approvals.stats.total')} value={statusCounts.all} color="teal" icon={<Wrench size={14} />} />
        </button>
        <button type="button" className="m-0 w-full border-0 bg-transparent p-0 text-left" onClick={() => handleStatusMode('pending')}>
          <StatCard label={t('pages.approvals.stats.pending')} value={statusCounts.pending} color="amber" icon={<ClockCircleOutlined />} />
        </button>
        <button type="button" className="m-0 w-full border-0 bg-transparent p-0 text-left" onClick={() => handleStatusMode('active')}>
          <StatCard label={t('hr.status.IN_REPAIR')} value={statusCounts.active} color="blue" icon={<ToolOutlined />} />
        </button>
        <button type="button" className="m-0 w-full border-0 bg-transparent p-0 text-left" onClick={() => handleStatusMode('done')}>
          <StatCard label={t('hr.labels.completed')} value={statusCounts.done} color="green" icon={<CheckCircleOutlined />} />
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
            placeholder={t('hr.placeholder.searchInspectionRepair')}
            className="w-full min-w-0 sm:w-72"
          />
          <Select
            mode="multiple"
            allowClear
            placeholder={t('hr.placeholder.status')}
            className="w-full min-w-0 sm:min-w-[180px] sm:w-auto"
            options={statusOptions}
            value={statusFilter}
            onChange={(value: InspectionRepairStatus[]) => {
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
          <Button onClick={handleResetFilters} disabled={!hasFilters} style={{ borderRadius: 0 }}>
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
            <ToolOutlined style={{ color: tokens.colorPrimary, fontSize: 16 }} />
            <h3 className="m-0 text-sm font-semibold" style={{ color: tokens.colorTextPrimary }}>
              {pageTitle}
            </h3>
            <span className="text-xs" style={{ color: tokens.colorTextTertiary }}>
              {totalCount} {totalCount === 1 ? t('pages.hr.inspectionRepair.requestSingular') : t('pages.hr.inspectionRepair.requestPlural')}
            </span>
          </div>
          <Space wrap size={8}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/approvals/new/inspection-repair')}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.newInspectionRepair')}
            </Button>
          </Space>
        </div>

        <div className="px-0">
          <DataTable<InspectionRepairListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && !listQuery.isLoading}
            scroll={false}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/inspection-repair/${record.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<ToolOutlined style={{ fontSize: 24 }} />}
                  title={t('hr.empty.noInspectionRepairRequests')}
                  description={pageDescription}
                  action={
                    hasFilters
                      ? { label: t('common.reset'), onClick: handleResetFilters }
                      : { label: t('hr.buttons.newInspectionRepair'), onClick: () => router.push('/approvals/new/inspection-repair') }
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
