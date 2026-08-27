'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Select,
  Space,
  Spin,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  AssetStatus,
  CompanyAssetListItem,
} from '@/lib/api/company-asset.types';
import { useCompanyAssets } from '@/lib/query/company-asset';
import { tokens } from '@/lib/theme/tokens';
import {
  ASSET_STATUS_OPTIONS,
  assetStatusVariant,
  formatAssetStatus,
} from '@/lib/utils/company-asset-display';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Company asset register list with filters, stats, and assignee column.
 */
export default function CompanyAssetListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();

  const countsBaseParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      type: typeFilter,
    }),
    [search, typeFilter],
  );

  const listParams = useMemo(
    () => ({
      ...params,
      ...countsBaseParams,
      status: statusFilter,
    }),
    [params, countsBaseParams, statusFilter],
  );

  const listQuery = useCompanyAssets(listParams, true);
  const totalCountQuery = useCompanyAssets(
    { page: 1, limit: 1, ...countsBaseParams },
    true,
  );
  const availableCountQuery = useCompanyAssets(
    { page: 1, limit: 1, status: 'AVAILABLE', ...countsBaseParams },
    true,
  );
  const inUseCountQuery = useCompanyAssets(
    { page: 1, limit: 1, status: 'IN_USE', ...countsBaseParams },
    true,
  );
  const repairingCountQuery = useCompanyAssets(
    { page: 1, limit: 1, status: 'REPAIRING', ...countsBaseParams },
    true,
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;
  const totalCount = meta?.total ?? rows.length;

  const statusCounts = {
    all: totalCountQuery.data?.meta?.total ?? totalCount,
    available: availableCountQuery.data?.meta?.total ?? 0,
    inUse: inUseCountQuery.data?.meta?.total ?? 0,
    repairing: repairingCountQuery.data?.meta?.total ?? 0,
  };

  const typeOptions = useMemo(() => {
    const types = new Set<string>();
    for (const row of rows) {
      if (row.type) {
        types.add(row.type);
      }
    }
    if (typeFilter) {
      types.add(typeFilter);
    }
    return [...types].sort().map((type) => ({ value: type, label: type }));
  }, [rows, typeFilter]);

  const pageTitle = t('pages.hr.companyAsset.listTitle');
  const pageDescription = t('pages.hr.companyAsset.listDescription');

  const columns: ColumnsType<CompanyAssetListItem> = useMemo(
    () => [
      {
        title: t('hr.assetLabels.serialNumber'),
        dataIndex: 'serialNumber',
        key: 'serialNumber',
        width: 140,
        render: (value: string) => (
          <span
            className="font-[family-name:var(--font-mono)] text-xs font-medium"
            style={{ color: tokens.colorPrimary }}
          >
            {value}
          </span>
        ),
      },
      {
        title: t('hr.assetLabels.brand'),
        dataIndex: 'brand',
        key: 'brand',
        width: 120,
        responsive: ['md'],
      },
      {
        title: t('hr.assetLabels.model'),
        dataIndex: 'model',
        key: 'model',
        width: 160,
        ellipsis: true,
        render: (value: string, row) => (
          <div className="min-w-0">
            <p
              className="m-0 truncate text-sm font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {value}
            </p>
            <p
              className="m-0 truncate text-xs md:hidden"
              style={{ color: tokens.colorTextTertiary }}
            >
              {row.brand}
            </p>
          </div>
        ),
      },
      {
        title: t('hr.assetLabels.type'),
        dataIndex: 'type',
        key: 'type',
        width: 120,
        responsive: ['lg'],
      },
      {
        title: t('hr.assetLabels.year'),
        dataIndex: 'year',
        key: 'year',
        width: 80,
        align: 'center',
        responsive: ['lg'],
      },
      {
        title: t('hr.assetLabels.assignedTo'),
        key: 'assignedTo',
        width: 180,
        render: (_: unknown, row: CompanyAssetListItem) => {
          if (!row.assignedTo) {
            return (
              <span style={{ color: tokens.colorTextTertiary }}>—</span>
            );
          }
          return (
            <div className="min-w-0 py-0.5">
              <p
                className="m-0 text-sm font-medium"
                style={{ color: tokens.colorTextPrimary }}
              >
                {formatUserName(row.assignedTo)}
              </p>
              {row.assignedTo.email ? (
                <p
                  className="m-0 truncate text-xs"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  {row.assignedTo.email}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        title: t('hr.assetLabels.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: AssetStatus) => (
          <StatusBadge
            label={formatAssetStatus(value, t)}
            variant={assetStatusVariant(value)}
          />
        ),
      },
    ],
    [t],
  );

  function handleResetFilters(): void {
    setSearch('');
    setStatusFilter(undefined);
    setTypeFilter(undefined);
    resetPage();
  }

  const hasFilters =
    Boolean(search.trim()) ||
    statusFilter !== undefined ||
    typeFilter !== undefined;

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
        <Spin />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('hr.assetMessages.failedToLoad')
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t('pages.approvals.stats.total')}
          value={statusCounts.all}
          color="teal"
          icon={<ToolOutlined />}
        />
        <StatCard
          label={t('hr.assetStatus.AVAILABLE')}
          value={statusCounts.available}
          color="blue"
          icon={<CheckCircleOutlined />}
        />
        <StatCard
          label={t('hr.assetStatus.IN_USE')}
          value={statusCounts.inUse}
          color="amber"
          icon={<ClockCircleOutlined />}
        />
        <StatCard
          label={t('hr.assetStatus.REPAIRING')}
          value={statusCounts.repairing}
          color="red"
          icon={<WarningOutlined />}
        />
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4">
        <div className="erp-filter-bar">
          <ListSearchInput
            committedValue={search}
            onCommit={(value) => {
              setSearch(value);
              resetPage();
            }}
            placeholder={t('hr.assetPlaceholder.search')}
            className="w-full min-w-0 sm:w-72"
          />
          <Select
            allowClear
            placeholder={t('hr.assetPlaceholder.filterStatus')}
            options={ASSET_STATUS_OPTIONS.map((option) => ({
              value: option.value,
              label: formatAssetStatus(option.value, t),
            }))}
            value={statusFilter}
            onChange={(value: AssetStatus | undefined) => {
              setStatusFilter(value);
              resetPage();
            }}
            className="w-full min-w-0 sm:min-w-[160px] sm:w-auto"
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('hr.assetPlaceholder.filterType')}
            value={typeFilter}
            onChange={(value: string | undefined) => {
              setTypeFilter(value);
              resetPage();
            }}
            options={typeOptions}
            className="w-full min-w-0 sm:min-w-[140px] sm:w-auto"
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

      {listQuery.isFetching && listQuery.data ? (
        <TableUpdatingIndicator active={listQuery.isFetching} />
      ) : null}

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ToolOutlined
              style={{ color: tokens.colorPrimary, fontSize: 16 }}
            />
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
                ? t('pages.hr.companyAsset.assetSingular')
                : t('pages.hr.companyAsset.assetPlural')}
            </span>
          </div>
          <Space wrap size={8}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/hr/company-asset/new')}
              style={{ borderRadius: 0 }}
            >
              {t('hr.assetButtons.newAsset')}
            </Button>
          </Space>
        </div>

        <div className="px-0">
          <DataTable<CompanyAssetListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && !listQuery.isLoading}
            scroll={false}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/company-asset/${record.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<ToolOutlined style={{ fontSize: 24 }} />}
                  title={t('hr.assetEmpty.noAssets')}
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('hr.assetButtons.newAsset'),
                          onClick: () =>
                            router.push('/hr/company-asset/new'),
                        }
                  }
                />
              ),
            }}
            pagination={
              meta
                ? {
                    ...bindMeta(meta),
                    pageSizeOptions: ['10', '20', '50', '100'],
                  }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
