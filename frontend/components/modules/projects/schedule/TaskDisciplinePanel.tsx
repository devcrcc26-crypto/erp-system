'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DisciplineDetailDrawer from '@/components/modules/projects/disciplines/DisciplineDetailDrawer';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import {
  useDeleteTaskDiscipline,
  useTaskDisciplines,
} from '@/lib/query/schedule';
import { formatDisciplineDateTime } from '@/components/modules/projects/disciplines/discipline-form.util';

export default function TaskDisciplinePanel({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}): React.ReactNode {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDiscipline | null>(null);
  const [deleting, setDeleting] = useState<TaskDiscipline | null>(null);

  const disciplinesQuery = useTaskDisciplines(projectId, taskId);
  const deleteDiscipline = useDeleteTaskDiscipline();

  const disciplines = disciplinesQuery.data ?? [];

  const columns: ColumnsType<TaskDiscipline> = [
    {
      title: 'Discipline',
      dataIndex: 'disciplineName',
      key: 'disciplineName',
      render: (name: string, record) => (
        <Link href={`/projects/${projectId}/disciplines/${record.id}`}>
          {name}
        </Link>
      ),
      ellipsis: true,
    },
    {
      title: 'Designer',
      dataIndex: 'designerName',
      key: 'designerName',
      render: (value: string | null) => value ?? '—',
    },
    {
      title: 'Reviewer',
      dataIndex: 'reviewerName',
      key: 'reviewerName',
      render: (value: string | null) => value ?? '—',
    },
    {
      title: 'Dept review',
      dataIndex: 'deptReviewTime',
      key: 'deptReviewTime',
      render: (value: string | null) => formatDisciplineDateTime(value),
    },
    {
      title: 'Institute review',
      dataIndex: 'instituteReviewTime',
      key: 'instituteReviewTime',
      render: (value: string | null) => formatDisciplineDateTime(value),
    },
    {
      title: '',
      key: 'actions',
      width: 160,
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

  return (
    <div className="mt-6 border-t border-slate-200 pt-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Disciplines</h3>
          <p className="text-xs text-slate-500">
            Design discipline breakdown — open the full workspace for packages and documents.
          </p>
        </div>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
        >
          Add discipline
        </Button>
      </div>

      <Table<TaskDiscipline>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={disciplines}
        loading={disciplinesQuery.isLoading}
        pagination={false}
        locale={{ emptyText: 'No disciplines added' }}
      />

      <DisciplineDetailDrawer
        open={drawerOpen}
        projectId={projectId}
        taskId={taskId}
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
        description={`Remove discipline "${deleting?.disciplineName}"?`}
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
              taskId,
              disciplineId: deleting.id,
            })
            .then(() => setDeleting(null));
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
