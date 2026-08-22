'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
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
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
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
  useDepartments,
  usePositions,
  type Position,
} from '@/lib/query/org';
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';

type StatusMode = 'all' | 'active' | 'inactive';

function filterPositions(
  rows: Position[],
  search: string,
  statusMode: StatusMode,
  departmentNameById: Map<string, string>,
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
    const departmentName =
      departmentNameById.get(row.departmentId)?.toLowerCase() ?? '';
    return (
      row.title.toLowerCase().includes(query) ||
      (row.grade?.toLowerCase().includes(query) ?? false) ||
      departmentName.includes(query)
    );
  });
}

export default function PositionsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
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
  const departmentsQuery = useDepartments({ page: 1, limit: 100 }, canView);
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

  const departmentNameById = useMemo(
    () =>
      new Map(
        (departmentsQuery.data?.data ?? []).map((department) => [
          department.id,
          department.name,
        ]),
      ),
    [departmentsQuery.data],
  );

  const stats = useMemo(
    () => ({
      total: allRows.length,
      active: allRows.filter((row) => row.isActive).length,
      inactive: allRows.filter((row) => !row.isActive).length,
    }),
    [allRows],
  );

  const filtered = useMemo(
    () =>
      filterPositions(allRows, appliedSearch, statusMode, departmentNameById),
    [allRows, appliedSearch, statusMode, departmentNameById],
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
    activePositionsQuery.isLoading ||
    inactivePositionsQuery.isLoading ||
    departmentsQuery.isLoading;
  const listFetching =
    activePositionsQuery.isFetching ||
    inactivePositionsQuery.isFetching ||
    departmentsQuery.isFetching;

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
        render: (value: string) => (
          <span
            className="text-sm font-medium"
            style={{ color: tokens.colorTextPrimary }}
          >
            {value}
          </span>
        ),
      },
      {
        title: t('pages.positions.table.department'),
        key: 'department',
        responsive: ['md'],
        render: (_value, record) =>
          departmentNameById.get(record.departmentId) ?? '—',
      },
      {
        title: t('pages.positions.table.grade'),
        dataIndex: 'grade',
        key: 'grade',
        responsive: ['lg'],
        render: (value: string | null) => value ?? '—',
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
                style={{ borderRadius: 0 }}
              />
            </Dropdown>
          </div>
        ),
      },
    ],
    [canManage, departmentNameById, t],
  );

  if (
    permLoading ||
    ((activePositionsQuery.isLoading || inactivePositionsQuery.isLoading) &&
      allRows.length === 0)
  ) {
    return (
      <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
        <Spin />
      </div>
    );
  }

  if (!canView) {
    return (
      <Alert type="warning" showIcon title={t('pages.positions.accessDenied')} />
    );
  }

  if (activePositionsQuery.isError || inactivePositionsQuery.isError) {
    return (
      <Alert type="error" showIcon title={t('pages.positions.loadFailed')} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1
          className="m-0 text-xl font-semibold tracking-tight"
          style={{
            color: tokens.colorTextPrimary,
            fontFamily: tokens.fontFamily,
          }}
        >
          {t('pages.positions.title')}
        </h1>
        <p
          className="mb-0 mt-1 text-sm"
          style={{ color: tokens.colorTextSecondary }}
        >
          {t('pages.positions.description')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('all')}
        >
          <StatCard
            label={t('pages.positions.stats.total')}
            value={stats.total}
            color="blue"
            icon={<IdcardOutlined />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('active')}
        >
          <StatCard
            label={t('common.active')}
            value={stats.active}
            color="green"
            icon={<CheckCircleOutlined />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('inactive')}
        >
          <StatCard
            label={t('common.inactive')}
            value={stats.inactive}
            color="default"
            icon={<StopOutlined />}
          />
        </button>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4">
        <div className="erp-filter-bar">
          <Input.Search
            placeholder={t('pages.positions.searchPlaceholder')}
            className="w-full min-w-0 sm:w-72"
            allowClear
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              setAppliedSearch(value.trim());
              resetPage();
            }}
            onSearch={(value) => {
              setSearch(value);
              setAppliedSearch(value.trim());
              resetPage();
            }}
            onClear={() => {
              setSearch('');
              setAppliedSearch('');
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
              loading={listFetching && !listLoading}
              onClick={() => refetchLists()}
              aria-label={t('common.refresh')}
              style={{ borderRadius: 0 }}
            />
          </Tooltip>
        </div>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <IdcardOutlined style={{ color: tokens.colorPrimary }} />
            <h3
              className="m-0 text-sm font-semibold"
              style={{ color: tokens.colorTextPrimary }}
            >
              {t('pages.positions.title')}
            </h3>
            <span
              className="text-xs"
              style={{ color: tokens.colorTextTertiary }}
            >
              {meta.total === 1
                ? t('pages.positions.countOne')
                : t('pages.positions.count', { count: meta.total })}
            </span>
          </div>
          {canManage ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setReadOnlyDrawer(false);
                setDrawerOpen(true);
              }}
              style={{ borderRadius: 0 }}
            >
              {t('pages.positions.addPosition')}
            </Button>
          ) : null}
        </div>

        <div className="px-0">
          <DataTable<Position>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={pageRows}
            loading={listFetching && pageRows.length === 0}
            scroll={false}
            pagination={bindMeta(meta)}
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
