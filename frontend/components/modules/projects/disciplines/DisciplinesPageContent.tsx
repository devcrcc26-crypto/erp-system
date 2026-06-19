'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Input } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import DisciplineDetailDrawer from '@/components/modules/projects/disciplines/DisciplineDetailDrawer';
import { ApiRequestError } from '@/lib/api/errors';
import { useProjectDisciplines, type ProjectDisciplineRow } from '@/lib/query/disciplines';
import { useDesignPackages } from '@/lib/query/design-packages';
import { useDeleteTaskDiscipline } from '@/lib/query/schedule';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

function DisciplinePackageCount({
  projectId,
  disciplineId,
}: {
  projectId: string;
  disciplineId: string;
}): React.ReactNode {
  const query = useDesignPackages(projectId, disciplineId);
  if (query.isLoading) {
    return <span className="text-slate-400">…</span>;
  }
  return <span>{query.data?.length ?? 0}</span>;
}

export default function DisciplinesPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const lens = useRoleLens();
  const { t } = useEpcTranslation();
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectDisciplineRow | null>(null);
  const [deleting, setDeleting] = useState<ProjectDisciplineRow | null>(null);

  const disciplinesQuery = useProjectDisciplines(projectId, lens.canViewEngineering);
  const deleteDiscipline = useDeleteTaskDiscipline();

  const apiUnavailable =
    disciplinesQuery.isError &&
    disciplinesQuery.error instanceof ApiRequestError &&
    (disciplinesQuery.error.status === 404 || disciplinesQuery.error.status === 0);

  const filtered = useMemo(() => {
    const rows = disciplinesQuery.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) {
      return rows;
    }
    return rows.filter(
      (row) =>
        row.disciplineName.toLowerCase().includes(term) ||
        row.taskName.toLowerCase().includes(term),
    );
  }, [disciplinesQuery.data, search]);

  const columns: ColumnsType<ProjectDisciplineRow> = [
    {
      title: 'Discipline',
      dataIndex: 'disciplineName',
      key: 'disciplineName',
      render: (name: string, record) => (
        <Link href={`/projects/${projectId}/disciplines/${record.id}`}>
          {name}
        </Link>
      ),
    },
    {
      title: 'Schedule task',
      dataIndex: 'taskName',
      key: 'taskName',
      ellipsis: true,
    },
    {
      title: 'Projected status',
      key: 'projectedStatus',
      render: (_value, record) =>
        record.projectedStatus ? (
          <ProjectedStatusBadge status={record.projectedStatus} />
        ) : (
          '—'
        ),
    },
    {
      title: 'Designer',
      dataIndex: 'designerName',
      key: 'designerName',
      render: (value: string | null) => value ?? '—',
    },
    {
      title: 'Packages',
      key: 'packages',
      width: 90,
      render: (_value, record) => (
        <DisciplinePackageCount projectId={projectId} disciplineId={record.id} />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 200,
      render: (_value, record) => (
        <div className="flex gap-2">
          <Link href={`/projects/${projectId}/disciplines/${record.id}`}>
            <Button type="link" className="!px-0">
              Workspace
            </Button>
          </Link>
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
      ),
    },
  ];

  if (!lens.canViewEngineering) {
    return (
      <Alert type="warning" showIcon title="You do not have access to engineering workspaces." />
    );
  }

  return (
    <FormLayout
      title={t('pages.disciplines.title')}
      description={t('pages.disciplines.description')}
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
        >
          {t('pages.disciplines.addDiscipline')}
        </Button>
      }
    >
      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title="EPC disciplines API not connected"
          description="Disciplines are sourced from schedule tasks. Design package counts appear when the backend is available."
        />
      )}

      <Input.Search
        allowClear
        placeholder="Search disciplines or tasks…"
        className="mb-4 max-w-xs"
        onSearch={setSearch}
      />

      <DataTable<ProjectDisciplineRow>
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={disciplinesQuery.isLoading}
        locale={{ emptyText: t('empty.noDisciplines') }}
      />

      <DisciplineDetailDrawer
        open={drawerOpen}
        projectId={projectId}
        taskId={editing?.taskId}
        discipline={editing}
        onClose={() => {
          setDrawerOpen(false);
          setEditing(null);
        }}
        onSaved={() => void disciplinesQuery.refetch()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete discipline"
        description={`Remove discipline "${deleting?.disciplineName}" from task "${deleting?.taskName}"?`}
        confirmLabel="Delete"
        danger
        confirmLoading={deleteDiscipline.isPending}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          void deleteDiscipline
            .mutateAsync({
              projectId,
              taskId: deleting.taskId,
              disciplineId: deleting.id,
            })
            .then(() => {
              setDeleting(null);
              void disciplinesQuery.refetch();
            });
        }}
        onCancel={() => setDeleting(null)}
      />
    </FormLayout>
  );
}
