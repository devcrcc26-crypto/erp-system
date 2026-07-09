'use client';

import { useMemo, useState } from 'react';
import { Alert, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import PositionFormDrawer from '@/components/modules/org/PositionFormDrawer';
import {
  useCanManageDepartments,
  useCanViewDepartmentsNav,
} from '@/hooks/use-org-nav-access';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import {
  useDepartments,
  usePositions,
  useUpdatePosition,
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [readOnlyDrawer, setReadOnlyDrawer] = useState(false);
  const [deactivating, setDeactivating] = useState<Position | null>(null);

  const positionsQuery = usePositions({ page: 1, limit: 200 }, canView);
  const departmentsQuery = useDepartments({ page: 1, limit: 200 }, canView);
  const updatePosition = useUpdatePosition();
  const positions = positionsQuery.data?.data ?? [];

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
          {canManage && record.isActive ? (
            <Button
              type="link"
              danger
              className="!px-0"
              onClick={() => setDeactivating(record)}
            >
              Deactivate
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  if (permLoading || positionsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canView) {
    return (
      <Alert type="warning" showIcon title="You do not have access to positions." />
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
      <DataTable<Position>
        rowKey="id"
        columns={columns}
        dataSource={positions}
        loading={positionsQuery.isLoading}
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
        onSaved={() => void positionsQuery.refetch()}
      />

      <ConfirmDialog
        open={Boolean(deactivating)}
        title="Deactivate position?"
        description={
          deactivating
            ? `"${deactivating.title}" will be hidden from dropdowns but historical assignments are preserved.`
            : undefined
        }
        confirmLabel="Deactivate"
        danger
        confirmLoading={updatePosition.isPending}
        onConfirm={() => {
          if (!deactivating) {
            return;
          }
          void updatePosition
            .mutateAsync({
              id: deactivating.id,
              body: { isActive: false },
            })
            .then(() => {
              messageApi.success('Position deactivated');
              setDeactivating(null);
              void positionsQuery.refetch();
            })
            .catch((error: unknown) => {
              notifyApiError(error, 'Failed to deactivate position', messageApi);
            });
        }}
        onCancel={() => setDeactivating(null)}
      />
    </FormLayout>
  );
}
