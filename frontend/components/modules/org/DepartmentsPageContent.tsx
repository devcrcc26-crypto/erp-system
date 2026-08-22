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
  BankOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import DepartmentFormDrawer from '@/components/modules/org/DepartmentFormDrawer';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanManageDepartments, useCanViewDepartmentsNav } from '@/hooks/use-org-nav-access';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type { PaginationMeta } from '@/lib/api/types';
import {
  countActiveProjectsForDepartment,
  countProjectsForDepartment,
  useDepartmentMetrics,
} from '@/lib/query/department-metrics';
import { useDepartments, useDeleteDepartment, type DepartmentRow } from '@/lib/query/org';
import { useAllProjects } from '@/lib/query/projects';
import { useUsersDirectory } from '@/lib/query/users';
import { useAuthStore } from '@/stores/auth.store';
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const LEADER_WARNING_DISMISS_KEY = 'erp-departments-leader-warning-dismissed';

type StatusMode = 'all' | 'active' | 'inactive';

function filterDepartments(
  rows: DepartmentRow[],
  search: string,
  statusMode: StatusMode,
): DepartmentRow[] {
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
      (row.code?.toLowerCase().includes(query) ?? false)
    );
  });
}

function DepartmentPortfolioStats({
  departments,
}: {
  departments: Array<Pick<DepartmentRow, 'id' | 'code'>>;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const metrics = useDepartmentMetrics(departments);

  const cards = [
    {
      label: t('pages.departments.stats.totalProjects'),
      value: metrics.totalProjects,
      color: 'blue' as const,
    },
    {
      label: t('pages.departments.stats.activeProjects'),
      value: metrics.activeProjects,
      color: 'green' as const,
    },
    {
      label: t('pages.departments.stats.totalTasks'),
      value: metrics.totalTasks,
      color: 'teal' as const,
    },
    {
      label: t('pages.departments.stats.totalSubtasks'),
      value: metrics.totalSubtasks,
      color: 'default' as const,
    },
    {
      label: t('pages.departments.stats.openSubtasks'),
      value: metrics.openSubtasks,
      color: 'amber' as const,
    },
    {
      label: t('pages.departments.stats.disciplinesInUse'),
      value: metrics.disciplinesInUse,
      color: 'blue' as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <StatCard
          key={card.label}
          label={card.label}
          value={metrics.isLoading ? 0 : card.value}
          color={card.color}
        />
      ))}
    </div>
  );
}

function DepartmentLeaderCard({
  department,
  leaderLabel,
  projectCount,
  activeProjectCount,
}: {
  department: DepartmentRow;
  leaderLabel: string;
  projectCount: number;
  activeProjectCount: number;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <div className="overflow-hidden rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5">
        <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {t('pages.departments.myDepartment')}
        </h3>
      </div>
      <div className="px-3 py-4 sm:px-5">
        <h2
          className="m-0 text-base font-semibold"
          style={{ color: tokens.colorTextPrimary }}
        >
          {department.name}
        </h2>
        {department.nameZh ? (
          <p
            className="mb-0 mt-1 text-xs"
            style={{ color: tokens.colorTextSecondary }}
          >
            {department.nameZh}
          </p>
        ) : null}
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt style={{ color: tokens.colorTextTertiary }}>
              {t('pages.departments.table.leader')}
            </dt>
            <dd
              className="m-0 font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {leaderLabel}
            </dd>
          </div>
          <div>
            <dt style={{ color: tokens.colorTextTertiary }}>
              {t('common.status')}
            </dt>
            <dd className="m-0">
              <StatusBadge
                label={
                  department.isActive
                    ? t('common.active')
                    : t('common.inactive')
                }
                variant={department.isActive ? 'success' : 'default'}
              />
            </dd>
          </div>
          <div>
            <dt style={{ color: tokens.colorTextTertiary }}>
              {t('pages.departments.table.projects')}
            </dt>
            <dd
              className="m-0 font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {projectCount}
            </dd>
          </div>
          <div>
            <dt style={{ color: tokens.colorTextTertiary }}>
              {t('pages.departments.table.activeProjects')}
            </dt>
            <dd
              className="m-0 font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {activeProjectCount}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default function DepartmentsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const permLoading = usePermissionsLoading();
  const canView = useCanViewDepartmentsNav();
  const canManage = useCanManageDepartments();
  const canViewHr = useCanViewHr();
  const canViewAll = canManage || canViewHr;
  const currentUserId = useAuthStore((state) => state.user?.id);
  const messageApi = useAppMessage();
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [deleting, setDeleting] = useState<DepartmentRow | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<StatusMode>('active');
  const [warningDismissed, setWarningDismissed] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.sessionStorage.getItem(LEADER_WARNING_DISMISS_KEY) === '1',
  );

  useSetHeaderExtra(null);

  const activeDepsQuery = useDepartments(
    { page: 1, limit: 100, isActive: true },
    canView,
  );
  const inactiveDepsQuery = useDepartments(
    { page: 1, limit: 100, isActive: false },
    canView,
  );
  const metricsDepsQuery = useDepartments({ page: 1, limit: 100 }, canView);
  const projectsQuery = useAllProjects({}, canView);
  const usersDirectory = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewAll },
  );
  const deleteDepartment = useDeleteDepartment();

  const allRows = useMemo(() => {
    const active = activeDepsQuery.data?.data ?? [];
    const inactive = inactiveDepsQuery.data?.data ?? [];
    const seen = new Set<string>();
    return [...active, ...inactive].filter((row) => {
      if (seen.has(row.id)) {
        return false;
      }
      seen.add(row.id);
      return true;
    });
  }, [activeDepsQuery.data?.data, inactiveDepsQuery.data?.data]);

  const allDepartmentsForMetrics = metricsDepsQuery.data?.data ?? [];
  const projects = projectsQuery.data?.data ?? [];

  const leaderNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of usersDirectory.data?.data ?? []) {
      const label = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
      map.set(user.id, label || user.email || user.id);
    }
    return map;
  }, [usersDirectory.data?.data]);

  const departmentsWithoutLeader = useMemo(
    () => allDepartmentsForMetrics.filter((row) => !row.leaderUserId),
    [allDepartmentsForMetrics],
  );

  const visibleSourceRows = useMemo(() => {
    if (canViewAll) {
      return allRows;
    }
    return allRows.filter((row) => row.leaderUserId === currentUserId);
  }, [allRows, canViewAll, currentUserId]);

  const stats = useMemo(
    () => ({
      total: visibleSourceRows.length,
      active: visibleSourceRows.filter((row) => row.isActive).length,
      inactive: visibleSourceRows.filter((row) => !row.isActive).length,
    }),
    [visibleSourceRows],
  );

  const filtered = useMemo(
    () => filterDepartments(visibleSourceRows, appliedSearch, statusMode),
    [visibleSourceRows, appliedSearch, statusMode],
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
    activeDepsQuery.isLoading ||
    inactiveDepsQuery.isLoading ||
    projectsQuery.isLoading;
  const listFetching =
    activeDepsQuery.isFetching ||
    inactiveDepsQuery.isFetching ||
    projectsQuery.isFetching;

  function refetchAll(): void {
    void activeDepsQuery.refetch();
    void inactiveDepsQuery.refetch();
    void metricsDepsQuery.refetch();
    void projectsQuery.refetch();
  }

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('active');
    resetPage();
  }

  function handleStatusMode(mode: StatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  function buildActionMenu(record: DepartmentRow): MenuProps['items'] {
    return [
      {
        key: 'edit',
        icon: <EditOutlined />,
        label: t('common.update'),
        onClick: () => {
          setEditing(record);
          setDrawerOpen(true);
        },
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: t('common.delete'),
        danger: true,
        onClick: () => setDeleting(record),
      },
    ];
  }

  const columns: ColumnsType<DepartmentRow> = useMemo(
    () => [
      {
        title: t('pages.departments.table.department'),
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
        title: t('pages.departments.table.leader'),
        key: 'leader',
        responsive: ['md'],
        render: (_value, record) =>
          record.leaderUserId ? (
            leaderNameById.get(record.leaderUserId) ?? t('common.assigned')
          ) : (
            <span className="text-red-600">
              {t('pages.departments.table.noLeader')}
            </span>
          ),
      },
      {
        title: t('pages.departments.table.projects'),
        key: 'projectCount',
        align: 'right',
        width: 90,
        responsive: ['lg'],
        render: (_value, record) => countProjectsForDepartment(projects, record),
      },
      {
        title: t('pages.departments.table.activeProjects'),
        key: 'activeProjectCount',
        align: 'right',
        width: 90,
        responsive: ['lg'],
        render: (_value, record) =>
          countActiveProjectsForDepartment(projects, record),
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
      ...(canManage
        ? [
            {
              title: '',
              key: 'actions',
              width: 56,
              fixed: 'right' as const,
              render: (_: unknown, record: DepartmentRow) => (
                <div
                  className="flex items-center justify-end"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Dropdown
                    menu={{ items: buildActionMenu(record) }}
                    trigger={['click']}
                  >
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
            } satisfies ColumnsType<DepartmentRow>[number],
          ]
        : []),
    ],
    [canManage, leaderNameById, projects, t],
  );

  if (permLoading || (listLoading && allRows.length === 0)) {
    return (
      <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
        <Spin />
      </div>
    );
  }

  if (!canView) {
    return (
      <Alert type="warning" showIcon title={t('pages.departments.accessDenied')} />
    );
  }

  if (!canViewAll && visibleSourceRows.length === 0) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('pages.departments.noLeaderAssigned')}
        description={t('pages.departments.noLeaderAssignedDesc')}
      />
    );
  }

  const leaderDepartment = visibleSourceRows[0] ?? null;

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
          {t('pages.departments.title')}
        </h1>
        <p
          className="mb-0 mt-1 text-sm"
          style={{ color: tokens.colorTextSecondary }}
        >
          {t('pages.departments.description')}
        </p>
      </div>

      {canViewAll && departmentsWithoutLeader.length > 0 && !warningDismissed ? (
        <Alert
          type="warning"
          showIcon
          closable
          title={t('pages.departments.noLeaderWarning')}
          description={t('pages.departments.noLeaderWarningDesc', {
            count: departmentsWithoutLeader.length,
          })}
          onClose={() => {
            setWarningDismissed(true);
            window.sessionStorage.setItem(LEADER_WARNING_DISMISS_KEY, '1');
          }}
        />
      ) : null}

      {canViewAll ? (
        <DepartmentPortfolioStats departments={allDepartmentsForMetrics} />
      ) : null}

      {canViewAll ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <button
              type="button"
              className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
              onClick={() => handleStatusMode('all')}
            >
              <StatCard
                label={t('pages.departments.stats.departmentsTotal')}
                value={stats.total}
                color="blue"
                icon={<BankOutlined />}
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
                placeholder={t('pages.departments.searchPlaceholder')}
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
                  onClick={() => refetchAll()}
                  aria-label={t('common.refresh')}
                  style={{ borderRadius: 0 }}
                />
              </Tooltip>
            </div>
          </div>

          <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <BankOutlined style={{ color: tokens.colorPrimary }} />
                <h3
                  className="m-0 text-sm font-semibold"
                  style={{ color: tokens.colorTextPrimary }}
                >
                  {t('pages.departments.title')}
                </h3>
                <span
                  className="text-xs"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  {meta.total === 1
                    ? t('pages.departments.countOne')
                    : t('pages.departments.count', { count: meta.total })}
                </span>
              </div>
              {canManage ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditing(null);
                    setDrawerOpen(true);
                  }}
                  style={{ borderRadius: 0 }}
                >
                  {t('pages.departments.addDepartment')}
                </Button>
              ) : null}
            </div>

            <div className="px-0">
              <DataTable<DepartmentRow>
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
                      icon={<BankOutlined />}
                      title={
                        hasFilters
                          ? t('pages.departments.emptyFiltered')
                          : t('pages.departments.empty')
                      }
                      description={t('pages.departments.description')}
                      action={
                        hasFilters
                          ? {
                              label: t('common.reset'),
                              onClick: handleResetFilters,
                            }
                          : canManage
                            ? {
                                label: t('pages.departments.addDepartment'),
                                onClick: () => {
                                  setEditing(null);
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
        </>
      ) : leaderDepartment ? (
        <DepartmentLeaderCard
          department={leaderDepartment}
          leaderLabel={
            leaderDepartment.leaderUserId
              ? leaderNameById.get(leaderDepartment.leaderUserId) ??
                t('pages.departments.you')
              : t('pages.departments.table.noLeader')
          }
          projectCount={countProjectsForDepartment(projects, leaderDepartment)}
          activeProjectCount={countActiveProjectsForDepartment(
            projects,
            leaderDepartment,
          )}
        />
      ) : null}

      {canManage ? (
        <DepartmentFormDrawer
          open={drawerOpen}
          editing={editing}
          onClose={() => {
            setDrawerOpen(false);
            setEditing(null);
          }}
          onSaved={() => refetchAll()}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('pages.departments.deleteTitle')}
        description={
          deleting
            ? t('pages.departments.deleteDescription', { name: deleting.name })
            : undefined
        }
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteDepartment.isPending}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          void deleteDepartment
            .mutateAsync(deleting.id)
            .then(() => {
              messageApi.success(t('pages.departments.deleted'));
              setDeleting(null);
              refetchAll();
            })
            .catch((error: unknown) => {
              notifyApiError(
                error,
                t('pages.departments.deleteFailed'),
                messageApi,
              );
            });
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
