'use client';

import { useMemo, useState } from 'react';
import { Alert, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ListStatusTabs, {
  type ListStatusTabKey,
} from '@/components/ui/ListStatusTabs/ListStatusTabs';
import PositionFormDrawer from '@/components/modules/org/PositionFormDrawer';
import {
  useCanManageDepartments,
  useCanViewDepartmentsNav,
} from '@/hooks/use-org-nav-access';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import {
  useDeletePosition,
  useDepartments,
  usePositions,
  type Position,
} from '@/lib/query/org';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

export default function PositionsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const permLoading = usePermissionsLoading();
  const canView = useCanViewDepartmentsNav();
  const canManage = useCanManageDepartments();
  const messageApi = useAppMessage();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [readOnlyDrawer, setReadOnlyDrawer] = useState(false);
  const [deleting, setDeleting] = useState<Position | null>(null);

  const activePositionsQuery = usePositions({ page: 1, limit: 100, isActive: true }, canView);
  const inactivePositionsQuery = usePositions({ page: 1, limit: 100, isActive: false }, canView);
  const departmentsQuery = useDepartments({ page: 1, limit: 100 }, canView);
  const deletePosition = useDeletePosition();

  const positions = activeTab === 'active'
    ? (activePositionsQuery.data?.data ?? [])
    : (inactivePositionsQuery.data?.data ?? []);
  const activeCount = activePositionsQuery.data?.meta?.total ?? 0;
  const inactiveCount = inactivePositionsQuery.data?.meta?.total ?? 0;

  const refetchLists = (): void => {
    void activePositionsQuery.refetch();
    void inactivePositionsQuery.refetch();
  };

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

  const columns: ColumnsType<Position> = [
    { title: 'Title', dataIndex: 'title', key: 'title' },
    {
      title: 'Department',
      key: 'department',
      render: (_value, record) => departmentNameById.get(record.departmentId) ?? '—',
    },
    {
      title: 'Grade',
      dataIndex: 'grade',
      key: 'grade',
      render: (value: string | null) => value ?? '—',
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
      render: (_value, record) => (
        <div className="flex flex-wrap gap-2">
          <Button
            type="link"
            className="!px-0"
            onClick={() => {
              setEditing(record);
              setReadOnlyDrawer(!canManage);
              setDrawerOpen(true);
            }}
          >
            {canManage ? 'Edit' : 'View'}
          </Button>
          {canManage ? (
            <Button
              type="link"
              danger
              className="!px-0"
              onClick={() => setDeleting(record)}
            >
              Delete
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  if (permLoading || activePositionsQuery.isLoading || inactivePositionsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canView) {
    return (
      <Alert type="warning" showIcon title="You do not have access to positions." />
    );
  }

  if (activePositionsQuery.isError || inactivePositionsQuery.isError) {
    return (
      <Alert
        type="error"
        showIcon
        title="Failed to load positions"
        description="Please refresh the page or contact your administrator."
      />
    );
  }

  return (
    <FormLayout
      title={t('pages.positions.title')}
      description={t('pages.positions.description')}
      extra={
        canManage ? (
          <Button
            type="primary"
            onClick={() => {
              setEditing(null);
              setReadOnlyDrawer(false);
              setDrawerOpen(true);
            }}
          >
            Add position
          </Button>
        ) : undefined
      }
    >
      <ListStatusTabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
        activeLabel="Active"
        closedLabel="Inactive"
        activeCount={activeCount}
        closedCount={inactiveCount}
      />

      <DataTable<Position>
        rowKey="id"
        columns={columns}
        dataSource={positions}
        loading={activePositionsQuery.isLoading || inactivePositionsQuery.isLoading}
        locale={{ emptyText: 'No positions defined' }}
      />

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
        title="Delete position?"
        description={
          deleting
            ? `"${deleting.title}" will be removed. Users assigned to this position will have their position cleared.`
            : undefined
        }
        confirmLabel="Delete"
        danger
        confirmLoading={deletePosition.isPending}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          void deletePosition
            .mutateAsync(deleting.id)
            .then(() => {
              messageApi.success('Position deleted');
              setDeleting(null);
              refetchLists();
            })
            .catch((error: unknown) => {
              notifyApiError(error, 'Failed to delete position', messageApi);
            });
        }}
        onCancel={() => setDeleting(null)}
      />
    </FormLayout>
  );
}
