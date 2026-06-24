'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Collapse,
  Form,
  InputNumber,
  Modal,
  Progress,
  Select,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import TaskFormDrawer from '@/components/modules/projects/schedule/TaskFormDrawer';
import type {
  Task,
  TaskDependency,
  TaskDependencyType,
} from '@/lib/api/project-management.types';
import {
  useCreateTaskDependency,
  useDeleteTask,
  useDeleteTaskDependency,
  useUpdateTaskDependency,
  scheduleKeys,
} from '@/lib/query/schedule';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import {
  formatTaskStatus,
  taskStatusVariant,
} from '@/lib/utils/pm-status-display';

const DEPENDENCY_TYPES: Array<{ value: TaskDependencyType; label: string }> = [
  { value: 'FS', label: 'Finish-to-Start (FS)' },
  { value: 'SS', label: 'Start-to-Start (SS)' },
  { value: 'FF', label: 'Finish-to-Finish (FF)' },
  { value: 'SF', label: 'Start-to-Finish (SF)' },
];

const DEPENDENCY_TYPE_LABELS = Object.fromEntries(
  DEPENDENCY_TYPES.map((item) => [item.value, item.label]),
) as Record<TaskDependencyType, string>;

interface DependencyFormValues {
  predecessorTaskId: string;
  successorTaskId: string;
  dependencyType: TaskDependencyType;
  lagDays?: number;
}

export default function TasksPanel({
  projectId,
  tasks: allTasks,
  dependencies,
  dependenciesLoading,
  criticalOnly,
}: {
  projectId: string;
  tasks: Task[];
  dependencies: TaskDependency[];
  dependenciesLoading: boolean;
  criticalOnly: boolean;
  onCriticalOnlyChange?: (value: boolean) => void;
}): React.ReactNode {
  const queryClient = useQueryClient();
  const messageApi = useAppMessage();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dependencyOpen, setDependencyOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [editingDependency, setEditingDependency] = useState<TaskDependency | null>(
    null,
  );
  const [deletingDependency, setDeletingDependency] = useState<TaskDependency | null>(
    null,
  );
  const [depForm] = Form.useForm<DependencyFormValues>();
  const [dependencySeed, setDependencySeed] = useState<
    Partial<DependencyFormValues>
  >({
    dependencyType: 'FS',
    lagDays: 0,
  });

  useEffect(() => {
    if (!dependencyOpen) {
      return;
    }

    if (editingDependency) {
      depForm.setFieldsValue({
        predecessorTaskId: editingDependency.predecessorTaskId,
        successorTaskId: editingDependency.successorTaskId,
        dependencyType: editingDependency.dependencyType,
        lagDays: editingDependency.lagDays,
      });
      return;
    }

    depForm.resetFields();
    depForm.setFieldsValue({
      dependencyType: 'FS',
      lagDays: 0,
      ...dependencySeed,
    });
  }, [dependencyOpen, dependencySeed, depForm, editingDependency]);

  const createDependency = useCreateTaskDependency();
  const updateDependency = useUpdateTaskDependency();
  const deleteDependency = useDeleteTaskDependency();
  const deleteTask = useDeleteTask();

  const tasks = useMemo(
    () =>
      criticalOnly ? allTasks.filter((task) => task.isCritical) : allTasks,
    [allTasks, criticalOnly],
  );

  const taskLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    for (const task of allTasks) {
      labels.set(task.id, `${task.taskIdCode} - ${task.name}`);
    }
    return labels;
  }, [allTasks]);

  const taskOptions = allTasks.map((task) => ({
    value: task.id,
    label: taskLabelById.get(task.id) ?? task.name,
  }));

  const dependencySaving = createDependency.isPending || updateDependency.isPending;

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
      align: 'right',
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

  const dependencyColumns: ColumnsType<TaskDependency> = [
    {
      title: 'Predecessor',
      dataIndex: 'predecessorTaskId',
      key: 'predecessorTaskId',
      ellipsis: true,
      render: (taskId: string) => taskLabelById.get(taskId) ?? taskId,
    },
    {
      title: 'Successor',
      dataIndex: 'successorTaskId',
      key: 'successorTaskId',
      ellipsis: true,
      render: (taskId: string) => taskLabelById.get(taskId) ?? taskId,
    },
    {
      title: 'Type',
      dataIndex: 'dependencyType',
      key: 'dependencyType',
      width: 180,
      render: (type: TaskDependencyType) => DEPENDENCY_TYPE_LABELS[type],
    },
    {
      title: 'Lag (days)',
      dataIndex: 'lagDays',
      key: 'lagDays',
      align: 'right',
      width: 100,
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
              setEditingDependency(record);
              setDependencyOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            type="link"
            danger
            className="!px-0"
            onClick={() => setDeletingDependency(record)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  function openAddDependency(sourceTask?: Task): void {
    setEditingDependency(null);
    setDependencySeed({
      dependencyType: 'FS',
      lagDays: 0,
      ...(sourceTask ? { predecessorTaskId: sourceTask.id } : {}),
    });
    setDependencyOpen(true);
  }

  function closeDependencyModal(): void {
    setDependencyOpen(false);
    setEditingDependency(null);
  }

  async function handleSaveDependency(
    values: DependencyFormValues,
  ): Promise<void> {
    const body = {
      predecessorTaskId: values.predecessorTaskId,
      successorTaskId: values.successorTaskId,
      dependencyType: values.dependencyType,
      lagDays: values.lagDays ?? 0,
    };

    try {
      if (editingDependency) {
        await updateDependency.mutateAsync({
          projectId,
          dependencyId: editingDependency.id,
          body,
        });
        messageApi.success('Dependency updated successfully');
      } else {
        await createDependency.mutateAsync({ projectId, body });
        messageApi.success('Dependency added successfully');
      }

      closeDependencyModal();
    } catch (error) {
      notifyApiError(
        error,
        editingDependency
          ? 'Failed to update task dependency'
          : 'Failed to add task dependency',
        messageApi,
      );
    }
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
        >
          Add task
        </Button>
      </div>
      <DataTable<Task>
        rowKey="id"
        columns={columns}
        dataSource={tasks}
        locale={{ emptyText: 'No tasks defined' }}
      />

      <Collapse
        bordered={false}
        className="erp-schedule-collapse mt-4 bg-transparent"
        items={[
          {
            key: 'dependencies',
            label: `Task dependencies (${dependencies.length})`,
            extra: (
              <Button
                type="link"
                size="small"
                className="!px-0"
                onClick={(event) => {
                  event.stopPropagation();
                  openAddDependency();
                }}
              >
                Add dependency
              </Button>
            ),
            children: (
              <DataTable<TaskDependency>
                rowKey="id"
                columns={dependencyColumns}
                dataSource={dependencies}
                loading={dependenciesLoading}
                locale={{ emptyText: 'No dependencies defined' }}
              />
            ),
          },
        ]}
      />

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
        title={editingDependency ? 'Edit task dependency' : 'Add task dependency'}
        centered
        forceRender
        onCancel={closeDependencyModal}
        onOk={() => depForm.submit()}
        okText={editingDependency ? 'Save dependency' : 'Add dependency'}
        confirmLoading={dependencySaving}
        afterClose={() => depForm.resetFields()}
      >
        <Form<DependencyFormValues>
          form={depForm}
          layout="vertical"
          initialValues={{ dependencyType: 'FS', lagDays: 0 }}
          onFinish={(values: DependencyFormValues) =>
            void handleSaveDependency(values)
          }
        >
          <Form.Item
            label="Predecessor"
            name="predecessorTaskId"
            rules={[{ required: true, message: 'Select predecessor' }]}
          >
            <Select showSearch options={taskOptions} optionFilterProp="label" />
          </Form.Item>
          <Form.Item
            label="Successor"
            name="successorTaskId"
            rules={[{ required: true, message: 'Select successor' }]}
          >
            <Select showSearch options={taskOptions} optionFilterProp="label" />
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
              messageApi.success('Task deleted successfully');
              setDeleting(null);
              void queryClient.invalidateQueries({
                queryKey: scheduleKeys.tasks(projectId),
              });
              void queryClient.invalidateQueries({
                queryKey: scheduleKeys.dependencies(projectId),
              });
            })
            .catch((error: unknown) => {
              notifyApiError(error, 'Failed to delete task', messageApi);
            });
        }}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingDependency)}
        title="Delete dependency"
        description="Remove this predecessor/successor link from the schedule?"
        confirmLabel="Delete"
        danger
        confirmLoading={deleteDependency.isPending}
        onConfirm={() => {
          if (!deletingDependency) {
            return;
          }
          void deleteDependency
            .mutateAsync({
              projectId,
              dependencyId: deletingDependency.id,
            })
            .then(() => {
              messageApi.success('Dependency deleted successfully');
              setDeletingDependency(null);
            })
            .catch((error: unknown) => {
              notifyApiError(error, 'Failed to delete dependency', messageApi);
            });
        }}
        onCancel={() => setDeletingDependency(null)}
      />
    </>
  );
}
