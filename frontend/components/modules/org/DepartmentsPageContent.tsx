'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Card } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import KPICard from '@/components/ui/KPICard/KPICard';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ListStatusTabs, {
  type ListStatusTabKey,
} from '@/components/ui/ListStatusTabs/ListStatusTabs';
import DepartmentFormDrawer from '@/components/modules/org/DepartmentFormDrawer';
import {
  useCanManageDepartments,
  useCanViewDepartmentsNav,
} from '@/hooks/use-org-nav-access';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import {
  countActiveProjectsForDepartment,
  countProjectsForDepartment,
  useDepartmentMetrics,
} from '@/lib/query/department-metrics';
import { useDepartments, useDeleteDepartment, type DepartmentRow } from '@/lib/query/org';
import { useAllProjects } from '@/lib/query/projects';
import { useUsersDirectory } from '@/lib/query/users';
import { useAuthStore } from '@/stores/auth.store';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const LEADER_WARNING_DISMISS_KEY = 'erp-departments-leader-warning-dismissed';

function DepartmentStatsRow({
  departments,
}: {
  departments: Array<Pick<DepartmentRow, 'id' | 'code'>>;
}): React.ReactNode {
  const metrics = useDepartmentMetrics(departments);

  const cards = [
    { label: 'Total Projects', value: metrics.totalProjects },
    { label: 'Active Projects', value: metrics.activeProjects },
    { label: 'Total Tasks', value: metrics.totalTasks },
    { label: 'Total Subtasks', value: metrics.totalSubtasks },
    { label: 'Open Subtasks', value: metrics.openSubtasks },
    { label: 'Disciplines in use', value: metrics.disciplinesInUse },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <KPICard
          key={card.label}
          label={card.label}
          value={metrics.isLoading ? '…' : String(card.value)}
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
  return (
    <Card className="erp-responsive-card">
      <div className="space-y-3">
        <div>
          <h2 className="text-[16px] font-medium text-slate-900">{department.name}</h2>
          {department.nameZh ? (
            <p className="text-[12px] text-slate-500">{department.nameZh}</p>
          ) : null}
        </div>
        <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Leader</dt>
            <dd className="font-medium text-slate-900">{leaderLabel}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd>
              <StatusBadge
                label={department.isActive ? 'Active' : 'Inactive'}
                variant={department.isActive ? 'success' : 'default'}
              />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Projects</dt>
            <dd className="font-medium text-slate-900">{projectCount}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Active projects</dt>
            <dd className="font-medium text-slate-900">{activeProjectCount}</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

export default function DepartmentsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const permLoading = usePermissionsLoading();
  const canView = useCanViewDepartmentsNav();
  const canManage = useCanManageDepartments();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const messageApi = useAppMessage();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [deleting, setDeleting] = useState<DepartmentRow | null>(null);
  const [warningDismissed, setWarningDismissed] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.sessionStorage.getItem(LEADER_WARNING_DISMISS_KEY) === '1',
  );

  const activeDepsQuery = useDepartments({ page: 1, limit: 100, isActive: true }, canView);
  const inactiveDepsQuery = useDepartments({ page: 1, limit: 100, isActive: false }, canView);
  const metricsDepsQuery = useDepartments({ page: 1, limit: 100 }, canView);
  const projectsQuery = useAllProjects({}, canView);
  const usersDirectory = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canManage },
  );
  const deleteDepartment = useDeleteDepartment();

  const activeDepartments = activeDepsQuery.data?.data ?? [];
  const inactiveDepartments = inactiveDepsQuery.data?.data ?? [];
  const allDepartmentsForMetrics = metricsDepsQuery.data?.data ?? [];
  const projects = projectsQuery.data?.data ?? [];

  const tabDepartments = activeTab === 'active' ? activeDepartments : inactiveDepartments;
  const activeCount = activeDepsQuery.data?.meta?.total ?? 0;
  const inactiveCount = inactiveDepsQuery.data?.meta?.total ?? 0;

  const visibleDepartments = useMemo(() => {
    if (canManage) {
      return tabDepartments;
    }
    return tabDepartments.filter((row) => row.leaderUserId === currentUserId);
  }, [tabDepartments, canManage, currentUserId]);

  const leaderNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of usersDirectory.data?.data ?? []) {
      const label = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
      map.set(user.id, label || user.email || user.id);
    }
    return map;
  }, [usersDirectory.data?.data]);

  const departmentsWithoutLeader = useMemo(
    () => allDepartmentsForMetrics.filter((row) => !row.leaderUserId),
    [allDepartmentsForMetrics],
  );

  const columns: ColumnsType<DepartmentRow> = [
    { title: 'Department', dataIndex: 'name', key: 'name' },
    {
      title: 'Name (Chinese)',
      dataIndex: 'nameZh',
      key: 'nameZh',
      render: (value: string | null) => value ?? '—',
    },
    {
      title: 'Leader',
      key: 'leader',
      render: (_value, record) =>
        record.leaderUserId ? (
          leaderNameById.get(record.leaderUserId) ?? 'Assigned'
        ) : (
          <span className="text-red-600">⚠ No leader</span>
        ),
    },
    {
      title: 'Projects',
      key: 'projectCount',
      align: 'right',
      width: 90,
      render: (_value, record) => countProjectsForDepartment(projects, record),
    },
    {
      title: 'Active',
      key: 'activeProjectCount',
      align: 'right',
      width: 90,
      render: (_value, record) =>
        countActiveProjectsForDepartment(projects, record),
    },
    {
      title: 'Status',
      key: 'isActive',
      width: 110,
      render: (_value, record) => (
        <StatusBadge
          label={record.isActive ? 'Active' : 'Inactive'}
          variant={record.isActive ? 'success' : 'default'}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 160,
      render: (_value, record) =>
        canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="link"
              className="!px-0"
              onClick={() => {
                setEditing(record);
                setDrawerOpen(true);
              }}
            >
              Edit
            </Button>
            <Button
              type="link"
              danger
              className="!px-0"
              onClick={() => setDeleting(record)}
            >
              Delete
            </Button>
          </div>
        ) : null,
    },
  ];

  if (permLoading || activeDepsQuery.isLoading || inactiveDepsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canView) {
    return (
      <Alert type="warning" showIcon title="You do not have access to departments." />
    );
  }

  if (!canManage && visibleDepartments.length === 0) {
    return (
      <Alert
        type="warning"
        showIcon
        title="No department assigned"
        description="You are not recorded as the leader of any department."
      />
    );
  }

  const leaderDepartment = visibleDepartments[0] ?? null;

  return (
    <FormLayout
      title={t('pages.departments.title')}
      description={t('pages.departments.description')}
      extra={
        canManage ? (
          <Button
            type="primary"
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
          >
            Add department
          </Button>
        ) : undefined
      }
    >
      {canManage && departmentsWithoutLeader.length > 0 && !warningDismissed ? (
        <Alert
          type="warning"
          showIcon
          closable
          className="mb-4"
          title="⚠ No leader assigned"
          description={`${departmentsWithoutLeader.length} department(s) have no leader assigned.`}
          onClose={() => {
            setWarningDismissed(true);
            window.sessionStorage.setItem(LEADER_WARNING_DISMISS_KEY, '1');
          }}
        />
      ) : null}

      <DepartmentStatsRow departments={allDepartmentsForMetrics} />

      <ListStatusTabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
        activeLabel="Active"
        closedLabel="Inactive"
        activeCount={activeCount}
        closedCount={inactiveCount}
      />

      {canManage ? (
        <DataTable<DepartmentRow>
          rowKey="id"
          columns={columns}
          dataSource={visibleDepartments}
          loading={activeDepsQuery.isLoading || inactiveDepsQuery.isLoading || projectsQuery.isLoading}
          locale={{ emptyText: 'No departments defined' }}
        />
      ) : leaderDepartment ? (
        <DepartmentLeaderCard
          department={leaderDepartment}
          leaderLabel={
            leaderDepartment.leaderUserId
              ? leaderNameById.get(leaderDepartment.leaderUserId) ?? 'You'
              : '⚠ No leader'
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
          onSaved={() => {
            void activeDepsQuery.refetch();
            void inactiveDepsQuery.refetch();
            void metricsDepsQuery.refetch();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete department?"
        description={
          deleting
            ? `"${deleting.name}" will be removed. Linked users and projects will have their department cleared; positions in this department will also be deleted.`
            : undefined
        }
        confirmLabel="Delete"
        danger
        confirmLoading={deleteDepartment.isPending}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          void deleteDepartment
            .mutateAsync(deleting.id)
            .then(() => {
              messageApi.success('Department deleted');
              setDeleting(null);
              void activeDepsQuery.refetch();
              void inactiveDepsQuery.refetch();
              void metricsDepsQuery.refetch();
            })
            .catch((error: unknown) => {
              notifyApiError(error, 'Failed to delete department', messageApi);
            });
        }}
        onCancel={() => setDeleting(null)}
      />
    </FormLayout>
  );
}
