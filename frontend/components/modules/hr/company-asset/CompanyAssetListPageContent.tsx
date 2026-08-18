'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select } from 'antd';
import { PlusOutlined, ToolOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  AssetStatus,
  CompanyAssetListItem,
} from '@/lib/api/company-asset.types';
import { useCompanyAssets } from '@/lib/query/company-asset';
import {
  ASSET_STATUS_OPTIONS,
  assetStatusVariant,
  formatAssetStatus,
} from '@/lib/utils/company-asset-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export default function CompanyAssetListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      status: statusFilter,
      type: typeFilter,
    }),
    [params, search, statusFilter, typeFilter],
  );

  const listQuery = useCompanyAssets(listParams, true);
  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const columns: ColumnsType<CompanyAssetListItem> = useMemo(
    () => [
      {
        title: t('hr.assetLabels.serialNumber'),
        dataIndex: 'serialNumber',
        key: 'serialNumber',
        width: 150,
      },
      {
        title: t('hr.assetLabels.brand'),
        dataIndex: 'brand',
        key: 'brand',
        width: 120,
      },
      {
        title: t('hr.assetLabels.model'),
        dataIndex: 'model',
        key: 'model',
        width: 140,
        ellipsis: true,
      },
      {
        title: t('hr.assetLabels.year'),
        dataIndex: 'year',
        key: 'year',
        width: 80,
        align: 'center',
      },
      {
        title: t('hr.assetLabels.type'),
        dataIndex: 'type',
        key: 'type',
        width: 120,
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
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : 'Failed to load company assets'
          }
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
        <ListSearchInput
          committedValue={search}
          onCommit={(value) => {
            setSearch(value);
            resetPage();
          }}
          placeholder={t('hr.assetPlaceholder.search')}
          style={{ width: 280 }}
        />

        <Select
          allowClear
          placeholder={t('hr.assetPlaceholder.filterStatus')}
          options={ASSET_STATUS_OPTIONS}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            resetPage();
          }}
          style={{ minWidth: 150 }}
        />

        <Select
          allowClear
          showSearch
          placeholder={t('hr.assetPlaceholder.filterType')}
          value={typeFilter}
          onChange={(v) => {
            setTypeFilter(v);
            resetPage();
          }}
          style={{ minWidth: 140 }}
          options={
            [...new Set(rows.map((r) => r.type).filter(Boolean))].map(
              (tp) => ({ value: tp, label: tp }),
            )
          }
        />

        <div className="ml-auto">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push('/hr/company-asset/new')}
          >
            {t('hr.assetButtons.newAsset')}
          </Button>
        </div>
      </div>

      {listQuery.isFetching && listQuery.data ? (
        <TableUpdatingIndicator active={listQuery.isFetching} />
      ) : null}

      <DataTable<CompanyAssetListItem>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={listQuery.isLoading}
        pagination={meta ? bindMeta(meta) : false}
        onRow={(row) => ({
          onClick: () => router.push(`/hr/company-asset/${row.id}`),
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: (
            <TableEmptyState
              icon={<ToolOutlined />}
              title={t('hr.assetEmpty.noAssets')}
            />
          ),
        }}
      />
    </div>
  );
}
