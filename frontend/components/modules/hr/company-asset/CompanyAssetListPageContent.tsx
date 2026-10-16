'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Grid,
  Input,
  Select,
  Spin,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import CompanyAssetPhoto from '@/components/modules/hr/company-asset/CompanyAssetPhoto';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type {
  AssetStatus,
  CompanyAssetListItem,
} from '@/lib/api/company-asset.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useCompanyAssetsAll } from '@/lib/query/company-asset';
import {
  assetStatusVariant,
  formatAssetStatus,
} from '@/lib/utils/company-asset-display';
import {
  filterCompanyAssets,
  type CompanyAssetStatusMode,
} from '@/lib/utils/company-asset-list-filter';
import {
  getNetValueColor,
  resolveAssetDepreciation,
} from '@/lib/utils/asset-depreciation-display';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { formatUserName } from '@/lib/utils/user-display';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import ImportModal from '@/components/modules/hr/import-export/ImportModal';
import { buildCompanyAssetExportSheets } from '@/lib/utils/company-asset-export';
import { companyAssetImportSchema } from '@/lib/utils/hr-import-configs';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
} as const;

function CompanyAssetStat({
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
      <span
        className="erp-users-stat-chip"
        style={{ background: tint.bg, color: tint.fg }}
      >
        {icon}
      </span>
      <div className="min-w-0 text-left">
        <p className="erp-users-stat-label">{label}</p>
        <p className="erp-users-stat-value">{value.toLocaleString()}</p>
      </div>
    </button>
  );
}

/**
 * Company asset register - Users chrome (stat bar, filter row, soft table).
 */
export default function CompanyAssetListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] =
    useState<CompanyAssetStatusMode>('all');
  const [typeFilter, setTypeFilter] = useState<string | undefined>();

  const [importOpen, setImportOpen] = useState(false);

  const listQuery = useCompanyAssetsAll({}, true);
  const allRows = listQuery.data ?? [];

  const statusCounts = useMemo(() => {
    return {
      all: allRows.length,
      available: allRows.filter((row) => row.status === 'AVAILABLE').length,
      inUse: allRows.filter((row) => row.status === 'IN_USE').length,
      repairing: allRows.filter((row) => row.status === 'REPAIRING').length,
    };
  }, [allRows]);

  const typeOptions = useMemo(() => {
    const types = new Set<string>();
    for (const row of allRows) {
      if (row.type) {
        types.add(row.type);
      }
    }
    return [...types].sort().map((type) => ({ value: type, label: type }));
  }, [allRows]);

  const filtered = useMemo(
    () =>
      filterCompanyAssets(allRows, {
        search: appliedSearch,
        statusMode,
        type: typeFilter,
      }),
    [allRows, appliedSearch, statusMode, typeFilter],
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

  const pageTitle = t('pages.hr.companyAsset.listTitle');
  const pageDescription = t('pages.hr.companyAsset.listDescription');

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    setTypeFilter(undefined);
    resetPage();
  }

  function handleStatusMode(mode: CompanyAssetStatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(typeFilter);

  const columns: ColumnsType<CompanyAssetListItem> = useMemo(
    () => [
      {
        title: t('hr.assetLabels.photo'),
        key: 'photo',
        width: 56,
        render: (_: unknown, record: CompanyAssetListItem) => (
          <div onClick={(event) => event.stopPropagation()}>
            <CompanyAssetPhoto
              assetId={record.id}
              photoDocumentId={record.photoDocumentId}
              label={record.serialNumber}
              canEdit={false}
              variant="thumb"
              size={40}
            />
          </div>
        ),
      },
      {
        title: t('hr.assetLabels.serialNumber'),
        dataIndex: 'serialNumber',
        key: 'serialNumber',
        width: 140,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-id-chip">{value}</span>
        ),
      },
      {
        title: t('hr.assetLabels.model'),
        dataIndex: 'model',
        key: 'model',
        width: isNarrow ? undefined : 180,
        ellipsis: true,
        render: (value: string, row: CompanyAssetListItem) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">
              {row.brand} {value}
            </p>
            <p className="erp-users-cell-sub m-0 mt-0.5 truncate">
              {isNarrow ? row.serialNumber : row.type}
              {isNarrow ? ` · ${row.type}` : ''}
            </p>
          </div>
        ),
      },
      {
        title: t('hr.assetLabels.assetCode'),
        dataIndex: 'assetCode',
        key: 'assetCode',
        width: 120,
        responsive: ['lg'],
        render: (value: string | null | undefined) =>
          value ? (
            <span className="erp-users-role-tag">{value}</span>
          ) : (
            <span className="erp-users-cell-sub">-</span>
          ),
      },
      {
        title: t('hr.assetLabels.type'),
        dataIndex: 'type',
        key: 'type',
        width: 120,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">{value}</span>
        ),
      },
      {
        title: t('hr.assetLabels.netValue'),
        key: 'netValue',
        width: 120,
        align: 'right',
        responsive: ['lg'],
        render: (_: unknown, row: CompanyAssetListItem) => {
          const depreciation = resolveAssetDepreciation(row);
          if (depreciation.netValue == null) {
            return <span className="erp-users-cell-sub">-</span>;
          }
          return (
            <span
              className="erp-users-cell-strong tabular-nums"
              style={{
                color: getNetValueColor(
                  depreciation.netValue,
                  row.originalValue,
                ),
              }}
            >
              {formatEtbAmount(depreciation.netValue)}
            </span>
          );
        },
      },
      {
        title: t('hr.assetLabels.year'),
        dataIndex: 'year',
        key: 'year',
        width: 80,
        align: 'center',
        responsive: ['xl'],
        render: (value: number) => (
          <span className="erp-users-cell-sub tabular-nums">{value}</span>
        ),
      },
      {
        title: t('hr.assetLabels.assignedTo'),
        key: 'assignedTo',
        width: 180,
        responsive: ['sm'],
        render: (_: unknown, row: CompanyAssetListItem) => {
          if (!row.assignedTo) {
            return <span className="erp-users-cell-sub">-</span>;
          }
          return (
            <div className="min-w-0">
              <p className="erp-users-cell-strong m-0">
                {formatUserName(row.assignedTo)}
              </p>
              {row.assignedTo.email ? (
                <p className="erp-users-email m-0 mt-0.5">
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
        width: isNarrow ? 100 : 130,
        render: (value: AssetStatus) => (
          <StatusBadge
            label={formatAssetStatus(value, t)}
            variant={assetStatusVariant(value)}
          />
        ),
      },
    ],
    [isNarrow, t],
  );

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-company-asset-page ${LIST_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-company-asset-page ${LIST_PAGE_V2}`}>
      {importOpen ? (
        <ImportModal
          schema={companyAssetImportSchema}
          title={t('hr.exportImport.companyAssets.title')}
          description={t('hr.exportImport.companyAssets.description')}
          onClose={() => setImportOpen(false)}
          onImported={() => void listQuery.refetch()}
        />
      ) : null}

      {listQuery.isError ? (
        <ErpNotice
          tone="error"
          className="mb-4"
          title={getFriendlyApiErrorMessage(
            listQuery.error,
            t('hr.assetMessages.failedToLoad'),
            t,
          )}
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <CompanyAssetStat
          label={t('pages.hr.companyAsset.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<ToolOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        <CompanyAssetStat
          label={t('pages.hr.companyAsset.stats.available')}
          value={statusCounts.available}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'AVAILABLE'}
          onClick={() => handleStatusMode('AVAILABLE')}
        />
        <CompanyAssetStat
          label={t('pages.hr.companyAsset.stats.inUse')}
          value={statusCounts.inUse}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'IN_USE'}
          onClick={() => handleStatusMode('IN_USE')}
        />
        <CompanyAssetStat
          label={t('pages.hr.companyAsset.stats.repairing')}
          value={statusCounts.repairing}
          accent="red"
          icon={<WarningOutlined />}
          active={statusMode === 'REPAIRING'}
          onClick={() => handleStatusMode('REPAIRING')}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">{pageTitle}</h3>
            <span className="erp-users-count-pill">
              {meta.total.toLocaleString()}
            </span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Tooltip title={t('common.refresh')}>
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={listQuery.isFetching && !listQuery.isLoading}
                onClick={() => void listQuery.refetch()}
                aria-label={t('common.refresh')}
              />
            </Tooltip>
            <HrListActions
              compact={isCompact}
              exports={[
                {
                  key: 'assets',
                  label: t('hr.exportImport.companyAssets.export'),
                  filePrefix: 'company-assets',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildCompanyAssetExportSheets(filtered),
                },
              ]}
              onImport={() => setImportOpen(true)}
              primary={{
                label: t('hr.assetButtons.newAsset'),
                onClick: () => router.push('/hr/company-asset/new'),
              }}
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.companyAsset.searchPlaceholder')}
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              setAppliedSearch(value.trim());
              resetPage();
            }}
            onPressEnter={() => {
              setAppliedSearch(search.trim());
              resetPage();
            }}
            onClear={() => {
              setSearch('');
              setAppliedSearch('');
              resetPage();
            }}
          />
          <span className="erp-users-filter-spacer" aria-hidden />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('hr.assetPlaceholder.filterType')}
            className="erp-users-filter-select"
            value={typeFilter}
            onChange={(value: string | undefined) => {
              setTypeFilter(value);
              resetPage();
            }}
            options={typeOptions}
          />
          {hasFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<CompanyAssetListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && rows.length === 0}
            scroll={{ x: isNarrow ? 560 : isCompact ? 860 : 1100 }}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/company-asset/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<ToolOutlined />}
                  title={
                    hasFilters
                      ? t('pages.hr.companyAsset.emptyFiltered')
                      : t('hr.assetEmpty.noAssets')
                  }
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
            pagination={{
              ...bindMeta(meta),
              pageSizeOptions: ['10', '20', '50', '100'],
              simple: isNarrow,
              showSizeChanger: !isNarrow,
            }}
          />
        </div>
      </div>
    </div>
  );
}
