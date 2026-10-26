'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/users/employees-v2.css';
import './org-v2.css';

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
  ApartmentOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import HrPersonCell from '@/components/modules/hr/shared/HrPersonCell';
import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
import DisciplineCatalogFormDrawer from '@/components/modules/org/DisciplineCatalogFormDrawer';
import { OrgListStat } from '@/components/modules/org/OrgListStat';
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

const PAGE_CHROME = `erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-org-disciplines-page erp-org-v2 ${LIST_PAGE_V2}`;

export default function DisciplinesCatalogPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
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
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0">{value}</p>
            {row.nameZh ? (
              <p className="erp-users-cell-sub m-0 mt-0.5 truncate">
                {row.nameZh}
              </p>
            ) : null}
            <p className="erp-users-cell-sub m-0 mt-0.5 md:hidden">
              {row.leader ? formatUserName(row.leader) : '-'}
            </p>
          </div>
        ),
      },
      {
        title: t('pages.disciplinesCatalog.table.leader'),
        key: 'leader',
        responsive: ['md'],
        render: (_value, record) =>
          record.leader ? (
            <HrPersonCell
              person={record.leader}
              name={formatUserName(record.leader)}
            />
          ) : (
            <span className="erp-users-cell-sub">-</span>
          ),
      },
      {
        title: t('pages.disciplinesCatalog.table.people'),
        key: 'users',
        align: 'right',
        width: 110,
        responsive: ['lg'],
        render: (_value, record) => (
          <span className="erp-users-cell-strong">
            {record._count?.users ?? 0}
          </span>
        ),
      },
      {
        title: t('common.status'),
        key: 'isActive',
        width: isNarrow ? 108 : 110,
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
            className="erp-table-row-actions flex items-center justify-end"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Dropdown
              menu={{ items: buildActionMenu(record) }}
              trigger={['click']}
              rootClassName="erp-row-actions-menu"
            >
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
    [canManage, isNarrow, t],
  );

  if (permLoading || (disciplinesQuery.isLoading && !disciplinesQuery.data)) {
    return (
      <div className={PAGE_CHROME}>
        <div className="erp-org-loading">
          <Spin />
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className={PAGE_CHROME}>
        <Alert
          type="warning"
          showIcon
          title={t('pages.disciplinesCatalog.accessDenied')}
        />
      </div>
    );
  }

  return (
    <div className={PAGE_CHROME}>
      <div className="erp-users-stat-bar">
        <OrgListStat
          label={t('pages.disciplinesCatalog.stats.total')}
          value={stats.total}
          accent="blue"
          icon={<ApartmentOutlined />}
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

      <div className="erp-pro-card erp-employees-list-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">
              {t('pages.disciplinesCatalog.title')}
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
                loading={disciplinesQuery.isFetching && !disciplinesQuery.isLoading}
                onClick={() => void disciplinesQuery.refetch()}
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
                aria-label={t('pages.disciplinesCatalog.addDiscipline')}
              >
                {isNarrow
                  ? undefined
                  : t('pages.disciplinesCatalog.addDiscipline')}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.disciplinesCatalog.searchPlaceholder')}
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
          <DataTable<EngineeringDiscipline>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={pageRows}
            loading={disciplinesQuery.isFetching && pageRows.length === 0}
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
        className="erp-hr-travel-modal"
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
