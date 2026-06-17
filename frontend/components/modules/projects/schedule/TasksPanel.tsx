'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
  Switch,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import type {
  Task,
  TaskDependencyType,
  TaskStatus,
} from '@/lib/api/project-management.types';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import {
  useCreateTask,
  useCreateTaskDependency,
  useDeleteTask,
  useMilestones,
  useUpdateTask,
  scheduleKeys,
} from '@/lib/query/schedule';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatTaskStatus,
  taskStatusVariant,
} from '@/lib/utils/pm-status-display';

const TASK_STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'DELAYED', label: 'Delayed' },
  { value: 'COMPLETED', label: 'Completed' },
];

const DEPENDENCY_TYPES: Array<{ value: TaskDependencyType; label: string }> = [
  { value: 'FS', label: 'Finish-to-Start (FS)' },
  { value: 'SS', label: 'Start-to-Start (SS)' },
  { value: 'FF', label: 'Finish-to-Finish (FF)' },
  { value: 'SF', label: 'Start-to-Finish (SF)' },
];

interface TaskFormValues {
  taskIdCode: string;
  name: string;
  description?: string;
  milestoneId?: string;
  assignedTo?: string;
  startDate?: Dayjs;
  finishDate?: Dayjs;
  durationDays?: number;
  progressPct?: number;
  status: TaskStatus;
  isCritical: boolean;
}

interface DependencyFormValues {
  predecessorTaskId: string;
  successorTaskId: string;
  dependencyType: TaskDependencyType;
  lagDays?: number;
}

function TaskFormDrawer({
  open,
  projectId,
  task,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  task?: Task;
  onClose: () => void;
  onSaved?: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<TaskFormValues>();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const milestonesQuery = useMilestones(projectId, { page: 1, limit: 50 }, open);
  const milestones = milestonesQuery.data?.data ?? [];
  const isEditing = Boolean(task);

  async function handleSubmit(values: TaskFormValues): Promise<void> {
    const body = {
      taskIdCode: values.taskIdCode.trim(),
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      milestoneId: values.milestoneId,
      assignedTo: values.assignedTo,
      startDate: values.startDate?.toISOString(),
      finishDate: values.finishDate?.toISOString(),
      durationDays: values.durationDays,
      progressPct: values.progressPct,
      status: values.status,
      isCritical: values.isCritical,
    };

    if (task) {
      await updateTask.mutateAsync({ projectId, taskId: task.id, body });
    } else {
      await createTask.mutateAsync({ projectId, body });
    }
    form.resetFields();
    onSaved?.();
    onClose();
  }

  return (
    <Drawer
      open={open}
      title={isEditing ? 'Edit task' : 'Add task'}
      onClose={onClose}
      size="large"
      destroyOnHidden
      afterOpenChange={(visible: boolean) => {
        if (!visible) {
          return;
        }
        if (task) {
          form.setFieldsValue({
            taskIdCode: task.taskIdCode,
            name: task.name,
            description: task.description ?? undefined,
            milestoneId: task.milestoneId ?? undefined,
            assignedTo: task.assignedTo ?? undefined,
            startDate: task.startDate ? dayjs(task.startDate) : undefined,
            finishDate: task.finishDate ? dayjs(task.finishDate) : undefined,
            durationDays: task.durationDays ?? undefined,
            progressPct: task.progressPct,
            status: task.status,
            isCritical: task.isCritical,
          });
          return;
        }
        form.resetFields();
        form.setFieldsValue({
          status: 'NOT_STARTED',
          progressPct: 0,
          isCritical: false,
        });
      }}
    >
      <Form<TaskFormValues>
        form={form}
        layout="vertical"
        onFinish={(values: TaskFormValues) => void handleSubmit(values)}
      >
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="Task ID"
            name="taskIdCode"
            rules={[{ required: true, message: 'Task ID is required' }]}
          >
            <Input placeholder="e.g. T-100" disabled={isEditing} />
          </Form.Item>
          <Form.Item
            label="Status"
            name="status"
            rules={[{ required: true, message: 'Status is required' }]}
          >
            <Select options={TASK_STATUS_OPTIONS} />
          </Form.Item>
        </div>
        <Form.Item
          label="Name"
          name="name"
          rules={[{ required: true, message: 'Name is required' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Milestone" name="milestoneId">
            <Select
              allowClear
              placeholder="Link to milestone"
              options={milestones.map((m) => ({
                value: m.id,
                label: m.name,
              }))}
            />
          </Form.Item>
          <Form.Item label="Assigned to" name="assignedTo">
            <UserSelect />
          </Form.Item>
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Start date" name="startDate">
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item label="Finish date" name="finishDate">
            <DatePicker className="w-full" />
          </Form.Item>
        </div>
        <div className="grid gap-4 md:grid-cols-3 md:gap-x-4">
          <Form.Item label="Duration (days)" name="durationDays">
            <InputNumber className="!w-full" min={0} />
          </Form.Item>
          <Form.Item label="Progress %" name="progressPct">
            <InputNumber className="!w-full" min={0} max={100} />
          </Form.Item>
          <Form.Item name="isCritical" valuePropName="checked">
            <Checkbox className="!mt-8">Critical path task</Checkbox>
          </Form.Item>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={createTask.isPending || updateTask.isPending}
          >
            Save task
          </Button>
        </div>
      </Form>
    </Drawer>
  );
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
      render: (status: TaskStatus) => (
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
