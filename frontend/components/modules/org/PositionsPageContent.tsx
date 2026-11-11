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
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  IdcardOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  RiseOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import Link from 'next/link';
import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
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
import { useFullUsersDirectory } from '@/lib/query/users';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const PAGE_CHROME =
  `erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-org-positions-page erp-org-v2 ${LIST_PAGE_V2}`;

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

function PositionTitleChip({ title }: { title: string }): React.ReactNode {
  const letter = title.trim().charAt(0).toUpperCase() || '?';
  return (
    <span className="erp-position-title-chip" aria-hidden>
      {letter}
    </span>
  );
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
  const usersDirectoryQuery = useFullUsersDirectory({ enabled: canView });
  const deletePosition = useDeletePosition();

  const allRows = useMemo(() => {
    const active = activePositionsQuery.data?.data ?? [];
    const inactive = inactivePositionsQuery.data?.data ?? [];
    const seen = new Set<string>();
    return [...active, ...inactive]
      .filter((row) => {
        if (seen.has(row.id)) {
          return false;
        }
        seen.add(row.id);
        return true;
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [activePositionsQuery.data?.data, inactivePositionsQuery.data?.data]);

  const assigneeCountByPositionId = useMemo(() => {
    const map = new Map<string, number>();
    for (const user of usersDirectoryQuery.data ?? []) {
      if (!user.positionId) {
        continue;
      }
      map.set(user.positionId, (map.get(user.positionId) ?? 0) + 1);
    }
    return map;
  }, [usersDirectoryQuery.data]);

  const stats = useMemo(
    () => ({
      total: allRows.length,
      active: allRows.filter((row) => row.isActive).length,
      inactive: allRows.filter((row) => !row.isActive).length,
      assigned: [...assigneeCountByPositionId.values()].reduce(
        (sum, count) => sum + count,
        0,
      ),
    }),
    [allRows, assigneeCountByPositionId],
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
  const statsLoading = listLoading && allRows.length === 0;

  function refetchLists(): void {
    void activePositionsQuery.refetch();
    void inactivePositionsQuery.refetch();
    void usersDirectoryQuery.refetch();
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

  function openCreateDrawer(): void {
    setEditing(null);
    setReadOnlyDrawer(false);
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
          <div className="erp-position-title-cell">
            <PositionTitleChip title={value} />
            <div className="min-w-0">
              <p className="erp-users-cell-strong m-0">{value}</p>
              {row.titleZh ? (
                <p className="erp-users-cell-sub m-0 truncate">{row.titleZh}</p>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        title: t('pages.positions.table.assignees'),
        key: 'assignees',
        width: isNarrow ? 88 : 110,
        align: 'right',
        responsive: ['sm'],
        render: (_value, record) => {
          const count = assigneeCountByPositionId.get(record.id) ?? 0;
          return (
            <span
              className={
                count > 0 ? 'erp-users-cell-strong' : 'erp-users-cell-sub'
              }
            >
              {count.toLocaleString()}
            </span>
          );
        },
      },
      {
        title: t('pages.positions.table.updated'),
        key: 'updatedAt',
        width: isNarrow ? 110 : 130,
        responsive: ['md'],
        render: (_value, record) => (
          <span className="erp-users-email">
            {dayjs(record.updatedAt).format('YYYY-MM-DD')}
          </span>
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
    [assigneeCountByPositionId, canManage, isNarrow, t],
  );

  if (permLoading || (listLoading && allRows.length === 0)) {
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
        <Alert type="warning" showIcon title={t('pages.positions.accessDenied')} />
      </div>
    );
  }

  if (activePositionsQuery.isError || inactivePositionsQuery.isError) {
    return (
      <div className={PAGE_CHROME}>
        <Alert type="error" showIcon title={t('pages.positions.loadFailed')} />
      </div>
    );
  }

  return (
    <div className={PAGE_CHROME}>
      <div className="erp-users-stat-bar">
        <OrgListStat
          label={t('pages.positions.stats.total')}
          value={statsLoading ? 0 : stats.total}
          accent="blue"
          icon={<IdcardOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        <OrgListStat
          label={t('common.active')}
          value={statsLoading ? 0 : stats.active}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'active'}
          onClick={() => handleStatusMode('active')}
        />
        <OrgListStat
          label={t('common.inactive')}
          value={statsLoading ? 0 : stats.inactive}
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
              {t('pages.positions.title')}
            </h3>
            <span className="erp-users-count-pill">
              {meta.total.toLocaleString()}
            </span>
            {statusMode !== 'all' ? (
              <span className="erp-position-filter-chip">
                {statusMode === 'active'
                  ? t('common.active')
                  : t('common.inactive')}
              </span>
            ) : null}
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
            <Link href="/seniority-levels" aria-label={t('nav.seniorityLevels')}>
              <Button icon={<RiseOutlined />} tabIndex={-1}>
                {isNarrow ? undefined : t('nav.seniorityLevels')}
              </Button>
            </Link>
            {canManage ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openCreateDrawer}
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
            onChange={(event) => {
              const value = event.target.value;
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
            aria-label={t('pages.positions.searchPlaceholder')}
          />
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
            scroll={{ x: isNarrow ? 480 : isCompact ? 680 : 820 }}
            onRow={(record) => ({
              onClick: () => openDrawer(record, !canManage),
              className: 'cursor-pointer',
            })}
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
                            onClick: openCreateDrawer,
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
        assigneeCount={
          editing ? (assigneeCountByPositionId.get(editing.id) ?? 0) : 0
        }
        onClose={() => {
          setDrawerOpen(false);
          setEditing(null);
          setReadOnlyDrawer(false);
        }}
        onSaved={() => refetchLists()}
      />

      <ConfirmDialog
        className="erp-hr-travel-modal"
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
