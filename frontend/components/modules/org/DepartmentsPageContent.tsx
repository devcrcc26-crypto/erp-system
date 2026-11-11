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
  AppstoreOutlined,
  BankOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PartitionOutlined,
  PlusOutlined,
  ProjectOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import HrPersonCell from '@/components/modules/hr/shared/HrPersonCell';
import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
import { OrgListStat } from '@/components/modules/org/OrgListStat';
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
const PAGE_CHROME =
  `erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-org-departments-page erp-org-v2 ${LIST_PAGE_V2}`;

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
      accent: 'blue' as const,
      icon: <ProjectOutlined />,
    },
    {
      label: t('pages.departments.stats.activeProjects'),
      value: metrics.activeProjects,
      accent: 'green' as const,
      icon: <CheckCircleOutlined />,
    },
    {
      label: t('pages.departments.stats.totalTasks'),
      value: metrics.totalTasks,
      accent: 'teal' as const,
      icon: <UnorderedListOutlined />,
    },
    {
      label: t('pages.departments.stats.totalSubtasks'),
      value: metrics.totalSubtasks,
      accent: 'slate' as const,
      icon: <PartitionOutlined />,
    },
    {
      label: t('pages.departments.stats.openSubtasks'),
      value: metrics.openSubtasks,
      accent: 'amber' as const,
      icon: <ClockCircleOutlined />,
    },
    {
      label: t('pages.departments.stats.disciplinesInUse'),
      value: metrics.disciplinesInUse,
      accent: 'blue' as const,
      icon: <AppstoreOutlined />,
    },
  ];

  return (
    <div className="erp-users-stat-bar erp-org-portfolio-stats">
      {cards.map((card) => (
        <OrgListStat
          key={card.label}
          label={card.label}
          value={metrics.isLoading ? 0 : card.value}
          accent={card.accent}
          icon={card.icon}
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
    <div className="erp-pro-card overflow-hidden">
      <div className="erp-pro-card-toolbar erp-users-toolbar">
        <div className="erp-users-toolbar-title">
          <h3 className="erp-pro-card-toolbar-title m-0">
            {t('pages.departments.myDepartment')}
          </h3>
        </div>
      </div>
      <div className="px-4 py-4 sm:px-5">
        <h2
          className="erp-users-cell-strong m-0 text-base"
          style={{ color: tokens.colorTextPrimary }}
        >
          {department.name}
        </h2>
        <p className="erp-users-email m-0 mt-1">
          {department.code}
          {department.nameZh ? ` · ${department.nameZh}` : ''}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="erp-users-stat-label">
              {t('pages.departments.table.leader')}
            </dt>
            <dd className="erp-users-cell-strong m-0">{leaderLabel}</dd>
          </div>
          <div>
            <dt className="erp-users-stat-label">{t('common.status')}</dt>
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
            <dt className="erp-users-stat-label">
              {t('pages.departments.table.projects')}
            </dt>
            <dd className="erp-users-cell-strong m-0">{projectCount}</dd>
          </div>
          <div>
            <dt className="erp-users-stat-label">
              {t('pages.departments.table.activeProjects')}
            </dt>
            <dd className="erp-users-cell-strong m-0">{activeProjectCount}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default function DepartmentsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
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
            <p className="erp-users-cell-strong m-0">{value}</p>
            <p className="erp-users-email m-0 mt-0.5 truncate">
              {row.code}
              {row.nameZh ? ` · ${row.nameZh}` : ''}
            </p>
          </div>
        ),
      },
      {
        title: t('pages.departments.table.leader'),
        key: 'leader',
        responsive: ['md'],
        render: (_value, record) =>
          record.leaderUserId ? (
            <HrPersonCell
              person={{ id: record.leaderUserId }}
              name={leaderNameById.get(record.leaderUserId) ?? t('common.assigned')}
            />
          ) : (
            <span className="erp-users-cell-sub text-red-600">
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
        render: (_value, record) => (
          <span className="erp-users-cell-strong">
            {countProjectsForDepartment(projects, record)}
          </span>
        ),
      },
      {
        title: t('pages.departments.table.activeProjects'),
        key: 'activeProjectCount',
        align: 'right',
        width: 90,
        responsive: ['lg'],
        render: (_value, record) => (
          <span className="erp-users-cell-strong">
            {countActiveProjectsForDepartment(projects, record)}
          </span>
        ),
      },
      {
        title: t('common.status'),
        key: 'isActive',
        width: isNarrow ? 96 : 110,
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
            } satisfies ColumnsType<DepartmentRow>[number],
          ]
        : []),
    ],
    [canManage, isNarrow, leaderNameById, projects, t],
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
        <Alert
          type="warning"
          showIcon
          title={t('pages.departments.accessDenied')}
        />
      </div>
    );
  }

  if (!canViewAll && visibleSourceRows.length === 0) {
    return (
      <div className={PAGE_CHROME}>
        <Alert
          type="warning"
          showIcon
          title={t('pages.departments.noLeaderAssigned')}
          description={t('pages.departments.noLeaderAssignedDesc')}
        />
      </div>
    );
  }

  const leaderDepartment = visibleSourceRows[0] ?? null;

  return (
    <div className={PAGE_CHROME}>
      {canViewAll &&
      departmentsWithoutLeader.length > 0 &&
      !warningDismissed ? (
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
        <>
          {/* <DepartmentPortfolioStats departments={allDepartmentsForMetrics} /> */}

          <div className="erp-users-stat-bar">
            <OrgListStat
              label={t('pages.departments.stats.departmentsTotal')}
              value={stats.total}
              accent="blue"
              icon={<BankOutlined />}
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
                  {t('pages.departments.title')}
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
                    onClick={() => refetchAll()}
                    aria-label={t('common.refresh')}
                  />
                </Tooltip>
                {canManage ? (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setEditing(null);
                      setDrawerOpen(true);
                    }}
                    aria-label={t('pages.departments.addDepartment')}
                  >
                    {isNarrow
                      ? undefined
                      : t('pages.departments.addDepartment')}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="erp-users-filter-bar">
              <Input
                allowClear
                prefix={<SearchOutlined className="erp-users-search-icon" />}
                placeholder={t('pages.departments.searchPlaceholder')}
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
                <Button
                  type="link"
                  onClick={handleResetFilters}
                  className="!px-1"
                >
                  {t('common.reset')}
                </Button>
              ) : null}
            </div>

            <div className="erp-pro-table-card-body">
              <DataTable<DepartmentRow>
                rowKey="id"
                className="erp-pro-table erp-users-table"
                size={isCompact ? 'small' : 'middle'}
                columns={columns}
                dataSource={pageRows}
                loading={listFetching && pageRows.length === 0}
                scroll={{ x: isNarrow ? 520 : isCompact ? 720 : 900 }}
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
                pagination={{
                  ...bindMeta(meta),
                  pageSizeOptions: ['10', '20', '50', '100'],
                  simple: isNarrow,
                  showSizeChanger: !isNarrow,
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
        className="erp-hr-travel-modal"
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
