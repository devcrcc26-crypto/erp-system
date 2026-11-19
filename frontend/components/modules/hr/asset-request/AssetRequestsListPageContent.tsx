'use client';
import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/users/employees-v2.css';
import { accent } from '@/lib/theme/accent';

import { useMemo, useState } from 'react';
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
import type {
  AssetRequestListItem,
  AssetRequestStatus,
} from '@/lib/api/asset-request.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useAssetRequestsAll } from '@/lib/query/asset-request';
import { useUsersDirectory } from '@/lib/query/users';
import {
  ASSET_REQUEST_STATUS_OPTIONS,
  assetRequestStatusVariant,
  formatAssetRequestEmployeeName,
  formatAssetRequestStatus,
} from '@/lib/utils/asset-request-display';
import {
  ASSET_REQUEST_APPROVED_STATUSES,
  ASSET_REQUEST_PENDING_STATUSES,
  ASSET_REQUEST_REJECTED_STATUSES,
  filterAssetRequests,
  type AssetRequestStatusMode,
} from '@/lib/utils/asset-request-list-filter';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';

const STAT_ACCENT = {
  teal: { bg: accent.light, fg: accent.primary },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
} as const;

function AssetRequestStat({
  label,
  value,
  accent: tintKey,
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
  const tint = STAT_ACCENT[tintKey];
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

export default function AssetRequestsListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<AssetRequestStatusMode>('all');
  const [exactStatus, setExactStatus] = useState<AssetRequestStatus | undefined>();
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();

  const listQuery = useAssetRequestsAll(
    { employeeId: canViewHr ? employeeId : undefined },
    true,
  );

  const allRows = listQuery.data ?? [];
  const isLoading = listQuery.isLoading;
  const isError = listQuery.isError;
  const error = listQuery.error;
  const isFetching = listQuery.isFetching;
  const refetch = listQuery.refetch;

  const usersQuery = useUsersDirectory({ page: 1, limit: 100 }, { enabled: canViewHr });
  const userOptions = (usersQuery.data?.data ?? []).map((u) => ({
    value: u.id,
    label: formatUserName(u),
  }));

  const statusCounts = useMemo(() => {
    const scoped = filterAssetRequests(allRows, {
      search: appliedSearch,
      employeeId: canViewHr ? employeeId : undefined,
      dateFrom,
      dateTo,
    });
    return {
      all: scoped.length,
      pending: scoped.filter((r) =>
        ASSET_REQUEST_PENDING_STATUSES.includes(r.status),
      ).length,
      approved: scoped.filter((r) =>
        ASSET_REQUEST_APPROVED_STATUSES.includes(r.status),
      ).length,
      rejected: scoped.filter((r) =>
        ASSET_REQUEST_REJECTED_STATUSES.includes(r.status),
      ).length,
    };
  }, [allRows, appliedSearch, canViewHr, employeeId, dateFrom, dateTo]);

  const filtered = useMemo(
    () =>
      filterAssetRequests(allRows, {
        search: appliedSearch,
        statusMode: exactStatus ? undefined : statusMode,
        exactStatus,
        employeeId: canViewHr ? employeeId : undefined,
        dateFrom,
        dateTo,
      }),
    [
      allRows,
      appliedSearch,
      statusMode,
      exactStatus,
      canViewHr,
      employeeId,
      dateFrom,
      dateTo,
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

  function handleStatusMode(mode: AssetRequestStatusMode): void {
    setExactStatus(undefined);
    setStatusMode(mode);
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
    <div className="erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-asset-requests-page">
      <section
        className="erp-employees-hero"
        aria-labelledby="erp-asset-requests-hero-title"
      >
        <div className="erp-employees-hero-top">
          <h2 id="erp-asset-requests-hero-title" className="erp-employees-hero-title">
            Asset Requests
          </h2>
        </div>
        <div className="erp-users-stat-bar erp-employees-hero-stats">
          <AssetRequestStat
            label="All Requests"
            value={statusCounts.all}
            accent="blue"
            icon={<InboxOutlined />}
            active={statusMode === 'all' && !exactStatus}
            onClick={() => handleStatusMode('all')}
          />
          <AssetRequestStat
            label="Pending"
            value={statusCounts.pending}
            accent="amber"
            icon={<ClockCircleOutlined />}
            active={statusMode === 'pending' && !exactStatus}
            onClick={() => handleStatusMode('pending')}
          />
          <AssetRequestStat
            label="Approved"
            value={statusCounts.approved}
            accent="teal"
            icon={<CheckCircleOutlined />}
            active={statusMode === 'approved' && !exactStatus}
            onClick={() => handleStatusMode('approved')}
          />
          <AssetRequestStat
            label="Rejected"
            value={statusCounts.rejected}
            accent="red"
            icon={<CloseCircleOutlined />}
            active={statusMode === 'rejected' && !exactStatus}
            onClick={() => handleStatusMode('rejected')}
          />
        </div>
      </section>

      <div className="erp-pro-card erp-employees-list-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-3">
            <span aria-hidden className="erp-employees-card-icon">
              <FormOutlined />
            </span>
            <h3 className="erp-pro-card-toolbar-title">Asset Requests</h3>
          </div>
          <Button
            icon={<ReloadOutlined spin={isFetching} />}
            onClick={() => void refetch()}
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
            value={exactStatus}
            onChange={(v: AssetRequestStatus | undefined) => {
              setExactStatus(v);
              setStatusMode('all');
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
            size={isCompact ? 'small' : 'middle'}
            pagination={bindMeta(meta)}
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
