'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Grid,
  Input,
  Spin,
  Tooltip,
  type MenuProps,
} from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  IdcardOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { OrgListStat } from '@/components/modules/org/OrgListStat';
import PositionFormDrawer from '@/components/modules/org/PositionFormDrawer';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import {
  useCanManageDepartments,
  useCanViewDepartmentsNav,
} from '@/hooks/use-org-nav-access';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type { PaginationMeta } from '@/lib/api/types';
import {
  useDeletePosition,
  usePositions,
  type Position,
} from '@/lib/query/org';
import { notifyApiError } from '@/lib/utils/notify-api-error';

type StatusMode = 'all' | 'active' | 'inactive';

function filterPositions(
  rows: Position[],
  search: string,
  statusMode: StatusMode,
): Position[] {
  const query = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (statusMode === 'active' && !row.isActive) {
      return false;
    }
    if (statusMode === 'inactive' && row.isActive) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      row.title.toLowerCase().includes(query) ||
      (row.titleZh?.toLowerCase().includes(query) ?? false)
    );
  });
}

export default function PositionsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const permLoading = usePermissionsLoading();
  const canView = useCanViewDepartmentsNav();
  const canManage = useCanManageDepartments();
  const messageApi = useAppMessage();
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [readOnlyDrawer, setReadOnlyDrawer] = useState(false);
  const [deleting, setDeleting] = useState<Position | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<StatusMode>('all');

  useSetHeaderExtra(null);

  const activePositionsQuery = usePositions(
    { page: 1, limit: 100, isActive: true },
    canView,
  );
  const inactivePositionsQuery = usePositions(
    { page: 1, limit: 100, isActive: false },
    canView,
  );
  const deletePosition = useDeletePosition();

  const allRows = useMemo(() => {
    const active = activePositionsQuery.data?.data ?? [];
    const inactive = inactivePositionsQuery.data?.data ?? [];
    const seen = new Set<string>();
    return [...active, ...inactive].filter((row) => {
      if (seen.has(row.id)) {
        return false;
      }
      seen.add(row.id);
      return true;
    });
  }, [activePositionsQuery.data?.data, inactivePositionsQuery.data?.data]);

  const stats = useMemo(
    () => ({
      total: allRows.length,
      active: allRows.filter((row) => row.isActive).length,
      inactive: allRows.filter((row) => !row.isActive).length,
    }),
    [allRows],
  );

  const filtered = useMemo(
    () => filterPositions(allRows, appliedSearch, statusMode),
    [allRows, appliedSearch, statusMode],
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

  const pageRows = useMemo(() => {
    const start = (meta.page - 1) * meta.limit;
    return filtered.slice(start, start + meta.limit);
  }, [filtered, meta.page, meta.limit]);

  const hasFilters = Boolean(appliedSearch.trim()) || statusMode !== 'all';
  const listLoading =
    activePositionsQuery.isLoading || inactivePositionsQuery.isLoading;
  const listFetching =
    activePositionsQuery.isFetching || inactivePositionsQuery.isFetching;

  function refetchLists(): void {
    void activePositionsQuery.refetch();
    void inactivePositionsQuery.refetch();
  }

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    resetPage();
  }

  function handleStatusMode(mode: StatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  function openDrawer(record: Position, readOnly: boolean): void {
    setEditing(record);
    setReadOnlyDrawer(readOnly);
    setDrawerOpen(true);
  }

  function buildActionMenu(record: Position): MenuProps['items'] {
    const items: MenuProps['items'] = [
      {
        key: 'view',
        icon: canManage ? <EditOutlined /> : <EyeOutlined />,
        label: canManage ? t('common.update') : t('common.view'),
        onClick: () => openDrawer(record, !canManage),
      },
    ];
    if (canManage) {
      items.push({
        key: 'delete',
        icon: <DeleteOutlined />,
        label: t('common.delete'),
        danger: true,
        onClick: () => setDeleting(record),
      });
    }
    return items;
  }

  const columns: ColumnsType<Position> = useMemo(
    () => [
      {
        title: t('pages.positions.table.title'),
        dataIndex: 'title',
        key: 'title',
        render: (value: string, row: Position) => (
          <div className="min-w-0 py-0.5">
            <p className="erp-users-cell-strong m-0">{value}</p>
            {row.titleZh ? (
              <p className="erp-users-cell-sub m-0 truncate">{row.titleZh}</p>
            ) : null}
          </div>
        ),
      },
      {
        title: t('common.status'),
        key: 'isActive',
        width: 110,
        render: (_value, record) => (
          <StatusBadge
            label={
              record.isActive ? t('common.active') : t('common.inactive')
            }
            variant={record.isActive ? 'success' : 'default'}
          />
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 56,
        fixed: 'right',
        render: (_value, record) => (
          <div
            className="flex items-center justify-end"
            onClick={(event) => event.stopPropagation()}
          >
            <Dropdown menu={{ items: buildActionMenu(record) }} trigger={['click']}>
              <Button
                size="small"
                type="text"
                icon={<MoreOutlined />}
                aria-label={t('common.actions')}
              />
            </Dropdown>
          </div>
        ),
      },
    ],
    [canManage, t],
  );

  if (
    permLoading ||
    ((activePositionsQuery.isLoading || inactivePositionsQuery.isLoading) &&
      allRows.length === 0)
  ) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-org-positions-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-org-positions-page">
        <Alert type="warning" showIcon title={t('pages.positions.accessDenied')} />
      </div>
    );
  }

  if (activePositionsQuery.isError || inactivePositionsQuery.isError) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-org-positions-page">
        <Alert type="error" showIcon title={t('pages.positions.loadFailed')} />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-org-positions-page">
      <div className="erp-users-stat-bar">
        <OrgListStat
          label={t('pages.positions.stats.total')}
          value={stats.total}
          accent="blue"
          icon={<IdcardOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        <OrgListStat
          label={t('common.active')}
          value={stats.active}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'active'}
          onClick={() => handleStatusMode('active')}
        />
        <OrgListStat
          label={t('common.inactive')}
          value={stats.inactive}
          accent="slate"
          icon={<StopOutlined />}
          active={statusMode === 'inactive'}
          onClick={() => handleStatusMode('inactive')}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">
              {t('pages.positions.title')}
            </h3>
            <span className="erp-users-count-pill">
              {meta.total.toLocaleString()}
            </span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Tooltip title={t('common.refresh')}>
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={listFetching && !listLoading}
                onClick={() => refetchLists()}
                aria-label={t('common.refresh')}
              />
            </Tooltip>
            {canManage ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditing(null);
                  setReadOnlyDrawer(false);
                  setDrawerOpen(true);
                }}
                aria-label={t('pages.positions.addPosition')}
              >
                {isNarrow ? undefined : t('pages.positions.addPosition')}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.positions.searchPlaceholder')}
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
          {hasFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<Position>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={pageRows}
            loading={listFetching && pageRows.length === 0}
            scroll={{ x: isNarrow ? 520 : isCompact ? 720 : 900 }}
            pagination={{
              ...bindMeta(meta),
              pageSizeOptions: ['10', '20', '50', '100'],
              simple: isNarrow,
              showSizeChanger: !isNarrow,
            }}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<IdcardOutlined />}
                  title={
                    hasFilters
                      ? t('pages.positions.emptyFiltered')
                      : t('pages.positions.empty')
                  }
                  description={t('pages.positions.description')}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : canManage
                        ? {
                            label: t('pages.positions.addPosition'),
                            onClick: () => {
                              setEditing(null);
                              setReadOnlyDrawer(false);
                              setDrawerOpen(true);
                            },
                          }
                        : undefined
                  }
                />
              ),
            }}
          />
        </div>
      </div>

      <PositionFormDrawer
        open={drawerOpen}
        editing={editing}
        readOnly={readOnlyDrawer}
        onClose={() => {
          setDrawerOpen(false);
          setEditing(null);
          setReadOnlyDrawer(false);
        }}
        onSaved={() => refetchLists()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('pages.positions.deleteTitle')}
        description={
          deleting
            ? t('pages.positions.deleteDescription', { title: deleting.title })
            : undefined
        }
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deletePosition.isPending}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          void deletePosition
            .mutateAsync(deleting.id)
            .then(() => {
              messageApi.success(t('pages.positions.deleted'));
              setDeleting(null);
              refetchLists();
            })
            .catch((error: unknown) => {
              notifyApiError(
                error,
                t('pages.positions.deleteFailed'),
                messageApi,
              );
            });
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
