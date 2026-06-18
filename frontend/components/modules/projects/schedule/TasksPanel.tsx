'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Form,
  InputNumber,
  Modal,
  Progress,
  Select,
  Switch,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import TaskFormDrawer from '@/components/modules/projects/schedule/TaskFormDrawer';
import type {
  Task,
  TaskDependencyType,
} from '@/lib/api/project-management.types';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import {
  useCreateTaskDependency,
  useDeleteTask,
  scheduleKeys,
} from '@/lib/query/schedule';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatTaskStatus,
  taskStatusVariant,
} from '@/lib/utils/pm-status-display';
import { projectDisciplinesHref } from '@/lib/navigation/project-workspace-nav';

const DEPENDENCY_TYPES: Array<{ value: TaskDependencyType; label: string }> = [
  { value: 'FS', label: 'Finish-to-Start (FS)' },
  { value: 'SS', label: 'Start-to-Start (SS)' },
  { value: 'FF', label: 'Finish-to-Finish (FF)' },
  { value: 'SF', label: 'Start-to-Finish (SF)' },
];

interface DependencyFormValues {
  predecessorTaskId: string;
  successorTaskId: string;
  dependencyType: TaskDependencyType;
  lagDays?: number;
}

export default function TasksPanel({
  projectId,
  tasks: allTasks,
  criticalOnly,
  onCriticalOnlyChange,
}: {
  projectId: string;
  tasks: Task[];
  criticalOnly: boolean;
  onCriticalOnlyChange: (value: boolean) => void;
}): React.ReactNode {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dependencyOpen, setDependencyOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [depForm] = Form.useForm<DependencyFormValues>();

  const resolveUserName = useUserNameLookup();
  const createDependency = useCreateTaskDependency();
  const deleteTask = useDeleteTask();

  const tasks = useMemo(
    () =>
      criticalOnly ? allTasks.filter((task) => task.isCritical) : allTasks,
    [allTasks, criticalOnly],
  );

  const taskOptions = allTasks.map((task) => ({
    value: task.id,
    label: `${task.taskIdCode} — ${task.name}`,
  }));

  const columns: ColumnsType<Task> = [
    {
      title: 'ID',
      dataIndex: 'taskIdCode',
      key: 'taskIdCode',
      width: 90,
    },
    {
      title: 'Task',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: 'Assigned to',
      dataIndex: 'assignedTo',
      key: 'assignedTo',
      render: (userId: string | null) =>
        userId ? resolveUserName(userId) : '—',
    },
    {
      title: 'Start',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (value: string | null) => formatProjectDate(value),
    },
    {
      title: 'Finish',
      dataIndex: 'finishDate',
      key: 'finishDate',
      render: (value: string | null) => formatProjectDate(value),
    },
    {
      title: 'Progress',
      dataIndex: 'progressPct',
      key: 'progressPct',
      width: 140,
      render: (value: number) => (
        <Progress percent={value} size="small" strokeColor="#f97316" />
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: Task['status']) => (
        <StatusBadge
          label={formatTaskStatus(status)}
          variant={taskStatusVariant(status)}
        />
      ),
    },
    {
      title: 'Disciplines',
      key: 'disciplines',
      width: 100,
      render: (_value, record) => (
        <Link href={projectDisciplinesHref(projectId, record.id)}>View</Link>
      ),
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

  async function handleAddDependency(
    values: DependencyFormValues,
  ): Promise<void> {
    await createDependency.mutateAsync({
      projectId,
      body: {
        predecessorTaskId: values.predecessorTaskId,
        successorTaskId: values.successorTaskId,
        dependencyType: values.dependencyType,
        lagDays: values.lagDays ?? 0,
      },
    });
    depForm.resetFields();
    setDependencyOpen(false);
  }

  return (
    <>
      <FormLayout
        title="Task list"
        description="Programme tasks with progress, assignments, and critical path flags."
        extra={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <Switch
                size="small"
                checked={criticalOnly}
                onChange={onCriticalOnlyChange}
              />
              Critical only
            </label>
            <Button onClick={() => setDependencyOpen(true)}>Add dependency</Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setDrawerOpen(true);
              }}
            >
              Add task
            </Button>
          </div>
        }
      >
        <DataTable<Task>
          rowKey="id"
          columns={columns}
          dataSource={tasks}
          locale={{ emptyText: 'No tasks defined' }}
        />
      </FormLayout>

      <TaskFormDrawer
        open={drawerOpen}
        projectId={projectId}
        task={editing ?? undefined}
        onClose={() => {
          setDrawerOpen(false);
          setEditing(null);
        }}
      />

      <Modal
        open={dependencyOpen}
        title="Add task dependency"
        onCancel={() => setDependencyOpen(false)}
        onOk={() => depForm.submit()}
        confirmLoading={createDependency.isPending}
        destroyOnHidden
      >
        <Form<DependencyFormValues>
          form={depForm}
          layout="vertical"
          initialValues={{ dependencyType: 'FS', lagDays: 0 }}
          onFinish={(values: DependencyFormValues) =>
            void handleAddDependency(values)
          }
        >
          <Form.Item
            label="Predecessor"
            name="predecessorTaskId"
            rules={[{ required: true, message: 'Select predecessor' }]}
          >
            <Select showSearch options={taskOptions} />
          </Form.Item>
          <Form.Item
            label="Successor"
            name="successorTaskId"
            rules={[{ required: true, message: 'Select successor' }]}
          >
            <Select showSearch options={taskOptions} />
          </Form.Item>
          <Form.Item
            label="Dependency type"
            name="dependencyType"
            rules={[{ required: true, message: 'Select type' }]}
          >
            <Select options={DEPENDENCY_TYPES} />
          </Form.Item>
          <Form.Item label="Lag (days)" name="lagDays">
            <InputNumber className="!w-full" />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete task"
        description={`Remove task "${deleting?.taskIdCode}"? Linked dependencies will also be removed.`}
        confirmLabel="Delete"
        danger
        confirmLoading={deleteTask.isPending}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          void deleteTask
            .mutateAsync({ projectId, taskId: deleting.id })
            .then(() => {
              setDeleting(null);
              void queryClient.invalidateQueries({
                queryKey: scheduleKeys.tasks(projectId),
              });
            });
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
