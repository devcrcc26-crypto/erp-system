'use client';

import { useState } from 'react';
import { Button, DatePicker, Form, Input, Modal, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import {
  useCreateTaskDiscipline,
  useDeleteTaskDiscipline,
  useTaskDisciplines,
  useUpdateTaskDiscipline,
} from '@/lib/query/schedule';

interface DisciplineFormValues {
  disciplineName: string;
  designerName?: string;
  reviewerName?: string;
  disciplinaryLeader?: string;
  deptChiefEngineer?: string;
  instituteChiefEngineer?: string;
  actualCompletionTime?: Dayjs;
  deptReviewTime?: Dayjs;
  instituteReviewTime?: Dayjs;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  return dayjs(value).format('DD/MM/YYYY HH:mm');
}

function toDisciplinePayload(values: DisciplineFormValues) {
  return {
    disciplineName: values.disciplineName.trim(),
    designerName: values.designerName?.trim() || undefined,
    reviewerName: values.reviewerName?.trim() || undefined,
    disciplinaryLeader: values.disciplinaryLeader?.trim() || undefined,
    deptChiefEngineer: values.deptChiefEngineer?.trim() || undefined,
    instituteChiefEngineer: values.instituteChiefEngineer?.trim() || undefined,
    actualCompletionTime: values.actualCompletionTime?.toISOString(),
    deptReviewTime: values.deptReviewTime?.toISOString(),
    instituteReviewTime: values.instituteReviewTime?.toISOString(),
  };
}

function toFormValues(discipline: TaskDiscipline): DisciplineFormValues {
  return {
    disciplineName: discipline.disciplineName,
    designerName: discipline.designerName ?? undefined,
    reviewerName: discipline.reviewerName ?? undefined,
    disciplinaryLeader: discipline.disciplinaryLeader ?? undefined,
    deptChiefEngineer: discipline.deptChiefEngineer ?? undefined,
    instituteChiefEngineer: discipline.instituteChiefEngineer ?? undefined,
    actualCompletionTime: discipline.actualCompletionTime
      ? dayjs(discipline.actualCompletionTime)
      : undefined,
    deptReviewTime: discipline.deptReviewTime
      ? dayjs(discipline.deptReviewTime)
      : undefined,
    instituteReviewTime: discipline.instituteReviewTime
      ? dayjs(discipline.instituteReviewTime)
      : undefined,
  };
}

export default function TaskDisciplinePanel({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}): React.ReactNode {
  const [form] = Form.useForm<DisciplineFormValues>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDiscipline | null>(null);
  const [deleting, setDeleting] = useState<TaskDiscipline | null>(null);

  const disciplinesQuery = useTaskDisciplines(projectId, taskId);
  const createDiscipline = useCreateTaskDiscipline();
  const updateDiscipline = useUpdateTaskDiscipline();
  const deleteDiscipline = useDeleteTaskDiscipline();

  const disciplines = disciplinesQuery.data ?? [];
  const isSubmitting = createDiscipline.isPending || updateDiscipline.isPending;

  const columns: ColumnsType<TaskDiscipline> = [
    {
      title: 'Discipline',
      dataIndex: 'disciplineName',
      key: 'disciplineName',
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
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: 'Institute review',
      dataIndex: 'instituteReviewTime',
      key: 'instituteReviewTime',
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_value, record) => (
        <div className="flex gap-2">
          <Button
            type="link"
            className="!px-0"
            onClick={() => {
              setEditing(record);
              setModalOpen(true);
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

  function openCreateModal(): void {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function closeModal(): void {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  }

  async function handleSubmit(values: DisciplineFormValues): Promise<void> {
    const body = toDisciplinePayload(values);

    if (editing) {
      await updateDiscipline.mutateAsync({
        projectId,
        taskId,
        disciplineId: editing.id,
        body,
      });
    } else {
      await createDiscipline.mutateAsync({ projectId, taskId, body });
    }

    closeModal();
  }

  return (
    <div className="mt-6 border-t border-slate-200 pt-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Disciplines</h3>
          <p className="text-xs text-slate-500">
            Design discipline breakdown and review tracking for this task.
          </p>
        </div>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={openCreateModal}
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

      <Modal
        open={modalOpen}
        title={editing ? 'Edit discipline' : 'Add discipline'}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={isSubmitting}
        destroyOnHidden
        width={720}
        afterOpenChange={(visible: boolean) => {
          if (!visible) {
            return;
          }
          if (editing) {
            form.setFieldsValue(toFormValues(editing));
            return;
          }
          form.resetFields();
        }}
      >
        <Form<DisciplineFormValues>
          form={form}
          layout="vertical"
          onFinish={(values: DisciplineFormValues) => void handleSubmit(values)}
        >
          <Form.Item
            label="Discipline name"
            name="disciplineName"
            rules={[{ required: true, message: 'Discipline name is required' }]}
          >
            <Input placeholder="e.g. Structural" />
          </Form.Item>
          <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
            <Form.Item label="Designer" name="designerName">
              <Input />
            </Form.Item>
            <Form.Item label="Reviewer" name="reviewerName">
              <Input />
            </Form.Item>
          </div>
          <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
            <Form.Item label="Disciplinary leader" name="disciplinaryLeader">
              <Input />
            </Form.Item>
            <Form.Item label="Dept chief engineer" name="deptChiefEngineer">
              <Input />
            </Form.Item>
          </div>
          <Form.Item label="Institute chief engineer" name="instituteChiefEngineer">
            <Input />
          </Form.Item>
          <div className="grid gap-4 md:grid-cols-3 md:gap-x-4">
            <Form.Item label="Actual completion" name="actualCompletionTime">
              <DatePicker className="w-full" showTime />
            </Form.Item>
            <Form.Item label="Dept review time" name="deptReviewTime">
              <DatePicker className="w-full" showTime />
            </Form.Item>
            <Form.Item label="Institute review time" name="instituteReviewTime">
              <DatePicker className="w-full" showTime />
            </Form.Item>
          </div>
        </Form>
      </Modal>

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
