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
  ApartmentOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import DisciplineCatalogFormDrawer from '@/components/modules/org/DisciplineCatalogFormDrawer';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import {
  useCanManageDisciplinesCatalog,
  useCanViewDisciplinesCatalogNav,
} from '@/hooks/use-org-nav-access';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type { PaginationMeta } from '@/lib/api/types';
import {
  useDeleteEngineeringDiscipline,
  useEngineeringDisciplines,
  type EngineeringDiscipline,
} from '@/lib/query/org';
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName } from '@/lib/utils/user-display';

type StatusMode = 'all' | 'active' | 'inactive';

function filterDisciplines(
  rows: EngineeringDiscipline[],
  search: string,
  statusMode: StatusMode,
): EngineeringDiscipline[] {
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
      row.name.toLowerCase().includes(query) ||
      (row.nameZh?.toLowerCase().includes(query) ?? false) ||
      (row.leader ? formatUserName(row.leader).toLowerCase().includes(query) : false)
    );
  });
}

export default function DisciplinesCatalogPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const permLoading = usePermissionsLoading();
  const canView = useCanViewDisciplinesCatalogNav();
  const canManage = useCanManageDisciplinesCatalog();
  const messageApi = useAppMessage();
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<EngineeringDiscipline | null>(null);
  const [readOnlyDrawer, setReadOnlyDrawer] = useState(false);
  const [deleting, setDeleting] = useState<EngineeringDiscipline | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<StatusMode>('all');

  useSetHeaderExtra(null);

  const disciplinesQuery = useEngineeringDisciplines(
    { page: 1, limit: 200, activeOnly: false },
    canView,
  );
  const deleteDiscipline = useDeleteEngineeringDiscipline();
  const allRows = disciplinesQuery.data?.data ?? [];

  const stats = useMemo(
    () => ({
      total: allRows.length,
      active: allRows.filter((row) => row.isActive).length,
      inactive: allRows.filter((row) => !row.isActive).length,
    }),
    [allRows],
  );

  const filtered = useMemo(
    () => filterDisciplines(allRows, appliedSearch, statusMode),
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

  function openDrawer(record: EngineeringDiscipline, readOnly: boolean): void {
    setEditing(record);
    setReadOnlyDrawer(readOnly);
    setDrawerOpen(true);
  }

  function buildActionMenu(record: EngineeringDiscipline): MenuProps['items'] {
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

  const columns: ColumnsType<EngineeringDiscipline> = useMemo(
    () => [
      {
        title: t('pages.disciplinesCatalog.table.discipline'),
        dataIndex: 'name',
        key: 'name',
        render: (value: string, row) => (
          <div className="min-w-0 py-0.5">
            <p
              className="m-0 text-sm font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {value}
            </p>
            {row.nameZh ? (
              <p
                className="m-0 truncate text-xs"
                style={{ color: tokens.colorTextTertiary }}
              >
                {row.nameZh}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        title: t('pages.disciplinesCatalog.table.leader'),
        key: 'leader',
        responsive: ['md'],
        render: (_value, record) =>
          record.leader ? formatUserName(record.leader) : '—',
      },
      {
        title: t('pages.disciplinesCatalog.table.taskAssignments'),
        key: 'taskDisciplines',
        align: 'right',
        width: 150,
        responsive: ['lg'],
        render: (_value, record) => record._count?.taskDisciplines ?? 0,
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
    [canManage, t],
  );

  if (permLoading || (disciplinesQuery.isLoading && !disciplinesQuery.data)) {
    return (
      <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
        <Spin />
      </div>
    );
  }

  if (!canView) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('pages.disciplinesCatalog.accessDenied')}
      />
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
          {t('pages.disciplinesCatalog.title')}
        </h1>
        <p
          className="mb-0 mt-1 text-sm"
          style={{ color: tokens.colorTextSecondary }}
        >
          {t('pages.disciplinesCatalog.description')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('all')}
        >
          <StatCard
            label={t('pages.disciplinesCatalog.stats.total')}
            value={stats.total}
            color="blue"
            icon={<ApartmentOutlined />}
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
            placeholder={t('pages.disciplinesCatalog.searchPlaceholder')}
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
              loading={disciplinesQuery.isFetching && !disciplinesQuery.isLoading}
              onClick={() => void disciplinesQuery.refetch()}
              aria-label={t('common.refresh')}
              style={{ borderRadius: 0 }}
            />
          </Tooltip>
        </div>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ApartmentOutlined style={{ color: tokens.colorPrimary }} />
            <h3
              className="m-0 text-sm font-semibold"
              style={{ color: tokens.colorTextPrimary }}
            >
              {t('pages.disciplinesCatalog.title')}
            </h3>
            <span
              className="text-xs"
              style={{ color: tokens.colorTextTertiary }}
            >
              {meta.total === 1
                ? t('pages.disciplinesCatalog.countOne')
                : t('pages.disciplinesCatalog.count', { count: meta.total })}
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
              {t('pages.disciplinesCatalog.addDiscipline')}
            </Button>
          ) : null}
        </div>

        <div className="px-0">
          <DataTable<EngineeringDiscipline>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={pageRows}
            scroll={false}
            pagination={bindMeta(meta)}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<ApartmentOutlined />}
                  title={
                    hasFilters
                      ? t('pages.disciplinesCatalog.emptyFiltered')
                      : t('pages.disciplinesCatalog.empty')
                  }
                  description={t('pages.disciplinesCatalog.description')}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : canManage
                        ? {
                            label: t('pages.disciplinesCatalog.addDiscipline'),
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

      <DisciplineCatalogFormDrawer
        open={drawerOpen}
        editing={editing}
        readOnly={readOnlyDrawer}
        onClose={() => {
          setDrawerOpen(false);
          setEditing(null);
          setReadOnlyDrawer(false);
        }}
        onSaved={() => void disciplinesQuery.refetch()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('pages.disciplinesCatalog.deleteTitle')}
        description={
          deleting
            ? t('pages.disciplinesCatalog.deleteDescription', {
                name: deleting.name,
              })
            : undefined
        }
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteDiscipline.isPending}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          void deleteDiscipline
            .mutateAsync(deleting.id)
            .then(() => {
              messageApi.success(t('pages.disciplinesCatalog.deleted'));
              setDeleting(null);
              void disciplinesQuery.refetch();
            })
            .catch((error: unknown) => {
              notifyApiError(
                error,
                t('pages.disciplinesCatalog.deleteFailed'),
                messageApi,
              );
            });
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
