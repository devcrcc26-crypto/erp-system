'use client';

import { useState } from 'react';
import { Alert, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DisciplineCatalogFormDrawer from '@/components/modules/org/DisciplineCatalogFormDrawer';
import {
  useCanManageDisciplinesCatalog,
  useCanViewDisciplinesCatalogNav,
} from '@/hooks/use-org-nav-access';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import {
  useDeleteEngineeringDiscipline,
  useEngineeringDisciplines,
  type EngineeringDiscipline,
} from '@/lib/query/org';
import { formatUserName } from '@/lib/utils/user-display';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

export default function DisciplinesCatalogPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const permLoading = usePermissionsLoading();
  const canView = useCanViewDisciplinesCatalogNav();
  const canManage = useCanManageDisciplinesCatalog();
  const messageApi = useAppMessage();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<EngineeringDiscipline | null>(null);
  const [readOnlyDrawer, setReadOnlyDrawer] = useState(false);
  const [deleting, setDeleting] = useState<EngineeringDiscipline | null>(null);

  const disciplinesQuery = useEngineeringDisciplines(
    { page: 1, limit: 200, activeOnly: false },
    canView,
  );
  const deleteDiscipline = useDeleteEngineeringDiscipline();
  const disciplines = disciplinesQuery.data?.data ?? [];

  const columns: ColumnsType<EngineeringDiscipline> = [
    { title: 'Discipline', dataIndex: 'name', key: 'name' },
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
        record.leader ? formatUserName(record.leader) : '—',
    },
    {
      title: 'Active task assignments',
      key: 'taskDisciplines',
      align: 'right',
      width: 170,
      render: (_value, record) => record._count?.taskDisciplines ?? 0,
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

  if (permLoading || disciplinesQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canView) {
    return (
      <Alert type="warning" showIcon title="You do not have access to disciplines." />
    );
  }

  return (
    <FormLayout
      title={t('pages.disciplinesCatalog.title')}
      description={t('pages.disciplinesCatalog.description')}
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
            Add discipline
          </Button>
        ) : undefined
      }
    >
      <DataTable<EngineeringDiscipline>
        rowKey="id"
        columns={columns}
        dataSource={disciplines}
        loading={disciplinesQuery.isLoading}
        locale={{ emptyText: 'No disciplines defined' }}
      />

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
        title="Delete discipline?"
        description={
          deleting
            ? `"${deleting.name}" will be removed. Task subtasks and users linked to this discipline will have their discipline cleared.`
            : undefined
        }
        confirmLabel="Delete"
        danger
        confirmLoading={deleteDiscipline.isPending}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          void deleteDiscipline
            .mutateAsync(deleting.id)
            .then(() => {
              messageApi.success('Discipline deleted');
              setDeleting(null);
              void disciplinesQuery.refetch();
            })
            .catch((error: unknown) => {
              notifyApiError(error, 'Failed to delete discipline', messageApi);
            });
        }}
        onCancel={() => setDeleting(null)}
      />
    </FormLayout>
  );
}
