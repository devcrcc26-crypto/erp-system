'use client';

import { useState } from 'react';
import { Button, DatePicker, Grid, Input, Select, Spin } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FormOutlined,
  InboxOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type { AssetRequestListItem, AssetRequestStatus } from '@/lib/api/asset-request.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useAssetRequests } from '@/lib/query/asset-request';
import { useUsersDirectory } from '@/lib/query/users';
import {
  ASSET_REQUEST_STATUS_OPTIONS,
  assetRequestStatusVariant,
  formatAssetRequestEmployeeName,
  formatAssetRequestStatus,
} from '@/lib/utils/asset-request-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
} as const;

function AssetRequestStat({
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
      <span className="erp-users-stat-chip" style={{ background: tint.bg, color: tint.fg }}>
        {icon}
      </span>
      <div className="min-w-0 text-left">
        <p className="erp-users-stat-label">{label}</p>
        <p className="erp-users-stat-value">{value.toLocaleString()}</p>
      </div>
    </button>
  );
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const PENDING_STATUSES: AssetRequestStatus[] = ['SUBMITTED', 'IN_REVIEW'];
const APPROVED_STATUSES: AssetRequestStatus[] = ['APPROVED', 'FULFILLED'];
const REJECTED_STATUSES: AssetRequestStatus[] = ['REJECTED', 'CANCELLED'];

function statusesForMode(mode: StatusFilter): AssetRequestStatus[] | undefined {
  if (mode === 'pending') return PENDING_STATUSES;
  if (mode === 'approved') return APPROVED_STATUSES;
  if (mode === 'rejected') return REJECTED_STATUSES;
  return undefined;
}

export default function AssetRequestsListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<StatusFilter>('all');
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();

  const filterStatuses = statusesForMode(statusMode);

  const { data, isLoading, isError, error, refetch, isFetching } = useAssetRequests({
    status: filterStatuses,
    search: appliedSearch || undefined,
    employeeId: canViewHr ? employeeId : undefined,
    dateFrom,
    dateTo,
    page: params.page,
    limit: params.limit,
  });

  const rows: AssetRequestListItem[] = data?.data ?? [];
  const meta: PaginationMeta | undefined = data?.meta;

  const usersQuery = useUsersDirectory({ page: 1, limit: 100 }, { enabled: canViewHr });
  const userOptions = (usersQuery.data?.data ?? []).map((u) => ({
    value: u.id,
    label: formatUserName(u),
  }));

  const allRows = rows;
  const total = allRows.length;
  const pendingCount = allRows.filter((r) => PENDING_STATUSES.includes(r.status as AssetRequestStatus)).length;
  const approvedCount = allRows.filter((r) => APPROVED_STATUSES.includes(r.status as AssetRequestStatus)).length;
  const rejectedCount = allRows.filter((r) => REJECTED_STATUSES.includes(r.status as AssetRequestStatus)).length;

  function handleSearch(): void {
    setAppliedSearch(search);
    resetPage();
  }

  function handleDateChange(
    setter: (v: string | undefined) => void,
    value: Dayjs | null,
    fmt: string,
  ): void {
    setter(value ? value.format(fmt) : undefined);
    resetPage();
  }

  const columns: ColumnsType<AssetRequestListItem> = [
    {
      title: 'Request #',
      dataIndex: 'requestNumber',
      key: 'requestNumber',
      width: 110,
      render: (val: string) => (
        <span className="erp-users-cell-strong font-mono text-xs">{val}</span>
      ),
    },
    ...(canViewHr
      ? [
          {
            title: 'Employee',
            key: 'employee',
            width: 160,
            render: (_: unknown, row: AssetRequestListItem) => (
              <span className="erp-users-cell-strong">
                {formatAssetRequestEmployeeName(row.employee)}
              </span>
            ),
          },
        ]
      : []),
    {
      title: 'Category',
      dataIndex: 'assetCategory',
      key: 'assetCategory',
      render: (val: string, row: AssetRequestListItem) => (
        <div>
          <span className="erp-users-cell-strong">{val}</span>
          {row.assetType ? (
            <p className="erp-users-cell-sub mb-0 mt-0.5">{row.assetType}</p>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: AssetRequestStatus) => (
        <StatusBadge variant={assetRequestStatusVariant(status)} label={formatAssetRequestStatus(status)} />
      ),
    },
    {
      title: 'Required By',
      dataIndex: 'requiredByDate',
      key: 'requiredByDate',
      width: 120,
      render: (val: string | null | undefined) =>
        val ? formatProjectDate(val) : <span className="erp-users-cell-sub">—</span>,
    },
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 110,
      render: (val: string) => formatProjectDate(val),
    },
  ];

  const errorMessage = isError
    ? getFriendlyApiErrorMessage(error, 'Failed to load asset requests', t)
    : null;

  return (
    <div className={`erp-pro-list-page erp-users-page ${LIST_PAGE_V2}`}>
      <div className="erp-users-stat-bar">
        <AssetRequestStat
          label="All Requests"
          value={meta?.total ?? total}
          accent="blue"
          icon={<InboxOutlined />}
          active={statusMode === 'all'}
          onClick={() => { setStatusMode('all'); resetPage(); }}
        />
        <AssetRequestStat
          label="Pending"
          value={pendingCount}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'pending'}
          onClick={() => { setStatusMode('pending'); resetPage(); }}
        />
        <AssetRequestStat
          label="Approved"
          value={approvedCount}
          accent="teal"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'approved'}
          onClick={() => { setStatusMode('approved'); resetPage(); }}
        />
        <AssetRequestStat
          label="Rejected"
          value={rejectedCount}
          accent="red"
          icon={<CloseCircleOutlined />}
          active={statusMode === 'rejected'}
          onClick={() => { setStatusMode('rejected'); resetPage(); }}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-users-toolbar">
          <span className="erp-pro-card-toolbar-title">Asset Requests</span>
          <Button
            icon={<ReloadOutlined spin={isFetching} />}
            onClick={() => refetch()}
            title="Refresh"
          />
        </div>

        <div className="erp-users-filter-bar">
          <Input.Search
            className="erp-users-search-input"
            placeholder="Search by category, type or number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={handleSearch}
            onPressEnter={handleSearch}
            allowClear
            prefix={<SearchOutlined />}
          />
          {canViewHr ? (
            <Select
              className="w-44"
              placeholder="All employees"
              allowClear
              showSearch
              options={userOptions}
              filterOption={(input, opt) =>
                (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
              value={employeeId}
              onChange={(v) => { setEmployeeId(v); resetPage(); }}
            />
          ) : null}
          <Select
            className="w-40"
            placeholder="All statuses"
            allowClear
            options={ASSET_REQUEST_STATUS_OPTIONS}
            value={filterStatuses?.[0] ?? undefined}
            onChange={(v) => {
              setStatusMode(
                PENDING_STATUSES.includes(v as AssetRequestStatus) ? 'pending'
                : APPROVED_STATUSES.includes(v as AssetRequestStatus) ? 'approved'
                : REJECTED_STATUSES.includes(v as AssetRequestStatus) ? 'rejected'
                : 'all',
              );
              resetPage();
            }}
          />
          <DatePicker
            placeholder="From date"
            onChange={(v) => handleDateChange(setDateFrom, v, 'YYYY-MM-DD')}
          />
          <DatePicker
            placeholder="To date"
            onChange={(v) => handleDateChange(setDateTo, v, 'YYYY-MM-DD')}
          />
        </div>

        {errorMessage ? (
          <div className="px-5 py-4">
            <ErpNotice tone="error" title={errorMessage} />
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : (
          <DataTable<AssetRequestListItem>
            rowKey="id"
            columns={columns}
            dataSource={rows}
            size="small"
            pagination={meta ? { ...bindMeta(meta), showSizeChanger: false } : false}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<FormOutlined />}
                  title="No asset requests"
                  description="No requests match your current filters."
                />
              ),
            }}
            onRow={(row) => ({
              onClick: () => router.push(`/hr/asset-requests/${row.id}`),
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </div>
    </div>
  );
}
