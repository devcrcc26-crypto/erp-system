'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Collapse,
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
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import TaskFormDrawer from '@/components/modules/projects/schedule/TaskFormDrawer';
import TaskDetailDrawer from '@/components/modules/projects/schedule/TaskDetailDrawer';
import ScheduleSubtaskStatusBadge from '@/components/modules/projects/schedule/ScheduleSubtaskStatusBadge';
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
  useScheduleSubtasks,
  type ScheduleSubtaskEntry,
} from '@/lib/query/schedule';
import { useProject, useProjectTeam } from '@/lib/query/projects';
import { formatProjectDate, formatProjectDesignStage } from '@/lib/utils/project-display';
import { formatLocalizedName } from '@/lib/utils/bilingual-name';
import StackedName from '@/components/ui/StackedName/StackedName';
import {
  computeScheduleSubtaskRollup,
  getScheduleSubtaskDisplayStatus,
  scheduleSubtaskWorkspaceHref,
} from '@/lib/utils/schedule-subtasks';
import { computeTaskProgressPct } from '@/lib/utils/schedule-metrics';
import { tokens } from '@/lib/theme/tokens';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import {
  formatTaskStatus,
  taskStatusVariant,
} from '@/lib/utils/pm-status-display';
import {
  formatArchivingLabel,
  formatTaskAttributesLabel,
  formatTaskReviewLevelLabel,
  formatUrgencyLevelLabel,
} from '@/lib/constants/task-comment8';
import { formatCommissionModeLabel } from '@/lib/constants/commission-mode';
import { formatDisciplineDate } from '@/components/modules/projects/disciplines/discipline-form.util';

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

type ScheduleTaskTableRow =
  | { rowType: 'task'; key: string; task: Task }
  | { rowType: 'subtask'; key: string; subtask: ScheduleSubtaskEntry };

function buildScheduleTableRows(
  tasks: Task[],
  subtasksByTaskId: Map<string, ScheduleSubtaskEntry[]>,
): ScheduleTaskTableRow[] {
  const rows: ScheduleTaskTableRow[] = [];

  for (const task of tasks) {
    rows.push({ rowType: 'task', key: task.id, task });
    const subtasks = subtasksByTaskId.get(task.id) ?? [];
    for (const subtask of subtasks) {
      rows.push({
        rowType: 'subtask',
        key: `subtask-${subtask.package.id}`,
        subtask,
      });
    }
  }

  return rows;
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
  const lens = useRoleLens();
  const queryClient = useQueryClient();
  const messageApi = useAppMessage();
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewing, setViewing] = useState<Task | null>(null);
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
  const { byTaskId: subtasksByTaskId, isSubtasksLoading } =
    useScheduleSubtasks(projectId);
  const projectQuery = useProject(projectId);
  const teamQuery = useProjectTeam(projectId);

  const teamNameById = useMemo(
    () =>
      new Map(
        (teamQuery.data ?? [])
          .filter((member) => member.userName)
          .map((member) => [member.userId, member.userName as string]),
      ),
    [teamQuery.data],
  );

  const projectName = projectQuery.data
    ? formatLocalizedName(projectQuery.data)
    : '';
  const projectNumber = projectQuery.data?.projectCode ?? '';

  const tasks = useMemo(
    () =>
      criticalOnly ? allTasks.filter((task) => task.isCritical) : allTasks,
    [allTasks, criticalOnly],
  );

  const taskLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    for (const task of allTasks) {
      labels.set(task.id, `${task.taskIdCode} - ${formatLocalizedName(task)}`);
    }
    return labels;
  }, [allTasks]);

  const taskOptions = allTasks.map((task) => ({
    value: task.id,
    label: taskLabelById.get(task.id) ?? formatLocalizedName(task),
  }));

  const dependencySaving = createDependency.isPending || updateDependency.isPending;

  const tableRows = useMemo(() => {
    const rows = buildScheduleTableRows(tasks, subtasksByTaskId);
    return showSubtasks
      ? rows
      : rows.filter((row) => row.rowType !== 'subtask');
  }, [tasks, subtasksByTaskId, showSubtasks]);

  const columns: ColumnsType<ScheduleTaskTableRow> = [
    {
      title: 'ID',
      key: 'taskIdCode',
      width: 90,
      render: (_value, record) =>
        record.rowType === 'task' ? record.task.taskIdCode : null,
    },
    {
      title: 'Name',
      key: 'name',
      ellipsis: true,
      render: (_value, record) => {
        if (record.rowType === 'task') {
          const subtasks = subtasksByTaskId.get(record.task.id) ?? [];
          const rollup = computeScheduleSubtaskRollup(
            subtasks.map((entry) => entry.package),
          );

          return (
            <div>
              <button
                type="button"
                className="text-left hover:underline"
                onClick={() => {
                  setViewing(record.task);
                  setDetailOpen(true);
                }}
              >
                <StackedName
                  name={record.task.name}
                  nameZh={record.task.nameZh}
                  className="text-[13px] font-medium"
                />
              </button>
              {rollup && (
                <p
                  className="mt-0.5 text-[11px]"
                  style={{ color: tokens.colorTextSecondary }}
                >
                  Subtasks: {rollup.closed}/{rollup.total} closed
                </p>
              )}
            </div>
          );
        }

        const { subtask } = record;
        const displayStatus = getScheduleSubtaskDisplayStatus(subtask.package);

        return (
          <div className="pl-8">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label="Subtask" variant="orange" />
              <span className="font-mono text-[11px] text-slate-500">
                {subtask.package.packageCode}
              </span>
              <span className="text-[12px] font-medium">
                {subtask.package.name}
              </span>
              <ScheduleSubtaskStatusBadge status={displayStatus} />
            </div>
            <p
              className="mt-0.5 text-[11px]"
              style={{ color: tokens.colorTextSecondary }}
            >
              {subtask.disciplineName}
            </p>
          </div>
        );
      },
    },
    {
      title: 'Start',
      key: 'startDate',
      render: (_value, record) =>
        record.rowType === 'task'
          ? formatProjectDate(record.task.startDate)
          : null,
    },
    {
      title: 'Finish',
      key: 'finishDate',
      render: (_value, record) =>
        record.rowType === 'task'
          ? formatProjectDate(record.task.finishDate)
          : null,
    },
    {
      title: 'Planned work days',
      key: 'computedPlannedWorkDays',
      align: 'right',
      render: (_value, record) =>
        record.rowType === 'task'
          ? record.task.computedPlannedWorkDays != null
            ? record.task.computedPlannedWorkDays
            : '-'
          : null,
    },
    {
      title: 'Actual work days',
      key: 'computedActualWorkDays',
      align: 'right',
      render: (_value, record) =>
        record.rowType === 'task'
          ? record.task.computedActualWorkDays != null
            ? record.task.computedActualWorkDays
            : '-'
          : null,
    },
    {
      title: 'Progress',
      key: 'progressPct',
      width: 140,
      align: 'right',
      render: (_value, record) => {
        if (record.rowType !== 'task') {
          return null;
        }
        const subtasks = subtasksByTaskId.get(record.task.id) ?? [];
        const progressPct = computeTaskProgressPct(subtasks);
        return progressPct !== null ? (
          <Progress percent={progressPct} size="small" strokeColor="#f97316" />
        ) : null;
      },
    },
    {
      title: 'Status',
      key: 'status',
      render: (_value, record) =>
        record.rowType === 'task' ? (
          <StatusBadge
            label={formatTaskStatus(record.task.status)}
            variant={taskStatusVariant(record.task.status)}
          />
        ) : null,
    },
    {
      title: 'Overseas Task Number',
      key: 'overseasTaskNumber',
      ellipsis: true,
      render: (_value, record) =>
        record.rowType === 'task' ? record.task.overseasTaskNumber || '-' : null,
    },
    {
      title: 'Project Name',
      key: 'projectName',
      ellipsis: true,
      render: (_value, record) => (record.rowType === 'task' ? projectName : null),
    },
    {
      title: 'Project Number',
      key: 'projectNumber',
      ellipsis: true,
      render: (_value, record) => (record.rowType === 'task' ? projectNumber : null),
    },
    {
      title: 'Main Work Content',
      key: 'mainWorkContent',
      ellipsis: true,
      render: (_value, record) =>
        record.rowType === 'task' ? record.task.description || '-' : null,
    },
    {
      title: 'Form of Archiving',
      key: 'formOfArchiving',
      ellipsis: true,
      render: (_value, record) =>
        record.rowType === 'task'
          ? formatArchivingLabel(record.task.requiresArchiving)
          : null,
    },
    {
      title: 'Mode of Project Commission',
      key: 'modeOfProjectCommission',
      ellipsis: true,
      render: (_value, record) =>
        record.rowType === 'task'
          ? record.task.commissionMode
            ? formatCommissionModeLabel(record.task.commissionMode)
            : '-'
          : null,
    },
    {
      title: 'Task Attributes',
      key: 'taskAttributesColumn',
      ellipsis: true,
      render: (_value, record) =>
        record.rowType === 'task'
          ? formatTaskAttributesLabel(record.task.taskAttributes)
          : null,
    },
    {
      title: 'On-site Task Receiving Time',
      key: 'onSiteReceivingTime',
      ellipsis: true,
      render: (_value, record) =>
        record.rowType === 'task'
          ? formatDisciplineDate(record.task.onSiteReceivingTime)
          : null,
    },
    {
      title: 'Time of Domestic Task Assignment',
      key: 'assignmentToHqTime',
      ellipsis: true,
      render: (_value, record) =>
        record.rowType === 'task'
          ? formatDisciplineDate(record.task.assignmentToHqTime)
          : null,
    },
    {
      title: 'Planned Task Completion Time',
      key: 'plannedTaskCompletionTime',
      ellipsis: true,
      render: (_value, record) =>
        record.rowType === 'task'
          ? formatProjectDate(record.task.finishDate)
          : null,
    },
    {
      title: 'Contact Sheet Number',
      key: 'contactFormNumber',
      ellipsis: true,
      render: (_value, record) =>
        record.rowType === 'task' ? record.task.contactFormNumber || '-' : null,
    },
    {
      title: 'Design Stage',
      key: 'designStageColumn',
      ellipsis: true,
      render: (_value, record) =>
        record.rowType === 'task'
          ? record.task.designStage
            ? formatProjectDesignStage(record.task.designStage)
            : '-'
          : null,
    },
    {
      title: 'Urgency Level',
      key: 'urgencyLevelColumn',
      ellipsis: true,
      render: (_value, record) =>
        record.rowType === 'task'
          ? formatUrgencyLevelLabel(record.task.urgencyLevel)
          : null,
    },
    {
      title: 'Whether the Work Plan Has Been Made',
      key: 'hasCustomSchedule',
      ellipsis: true,
      render: (_value, record) =>
        record.rowType === 'task'
          ? record.task.hasCustomSchedule
            ? 'Yes'
            : 'No'
          : null,
    },
    {
      title: 'Language',
      key: 'languageColumn',
      ellipsis: true,
      render: (_value, record) =>
        record.rowType === 'task'
          ? record.task.language === 'CHINESE'
            ? 'Chinese'
            : 'English'
          : null,
    },
    {
      title: 'Task Review Level',
      key: 'taskReviewLevel',
      ellipsis: true,
      render: (_value, record) =>
        record.rowType === 'task'
          ? formatTaskReviewLevelLabel(record.task.approvalLevel)
          : null,
    },
    {
      title: 'Responsible Person',
      key: 'supervisingChief',
      ellipsis: true,
      width: 220,
      render: (_value, record) =>
        record.rowType === 'task'
          ? (teamNameById.get(record.task.supervisingChiefUserId ?? '') ?? '-')
          : null,
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_value, record) => {
        if (record.rowType === 'subtask') {
          const href = scheduleSubtaskWorkspaceHref(
            projectId,
            record.subtask.taskDisciplineId,
            record.subtask.package.id,
          );
          return (
            <Link href={href}>
              <Button type="link" className="!px-0 text-[12px]">
                EPC Workspace
              </Button>
            </Link>
          );
        }

        return (
          <div className="flex flex-wrap gap-2">
            <Link href={`/projects/${projectId}/schedule/tasks/${record.task.id}`}>
              <Button type="link" className="!px-0">
                Open
              </Button>
            </Link>
            <Button
              type="link"
              className="!px-0"
              onClick={() => {
                setViewing(record.task);
                setDetailOpen(true);
              }}
            >
              View
            </Button>
            {lens.canEditEngineering && (
              <Button
                type="link"
                className="!px-0"
                onClick={() => {
                  setEditing(record.task);
                  setDrawerOpen(true);
                }}
              >
                Edit
              </Button>
            )}
            <Button
              type="link"
              danger
              className="!px-0"
              onClick={() => setDeleting(record.task)}
            >
              Delete
            </Button>
          </div>
        );
      },
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
      <div className="mb-3 flex items-center justify-end gap-4">
        <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
          <Switch
            size="small"
            checked={showSubtasks}
            onChange={setShowSubtasks}
          />
          Show subtasks
        </label>
        {lens.canEditEngineering && (
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
        )}
      </div>
      <DataTable<ScheduleTaskTableRow>
        rowKey="key"
        columns={columns}
        dataSource={tableRows}
        pagination={false}
        scroll={{ x: 'max-content' }}
        loading={isSubtasksLoading ? { spinning: true, tip: 'Loading subtasks…' } : false}
        locale={{ emptyText: 'No tasks defined' }}
        onRow={(record) => ({
          className:
            record.rowType === 'task'
              ? 'schedule-task-row border-l-4 !border-l-[#3b82f6]'
              : 'schedule-subtask-row border-l-4 !border-l-amber-400 bg-[#fffbeb]/40',
        })}
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

      <TaskDetailDrawer
        open={detailOpen}
        projectId={projectId}
        task={viewing}
        onClose={() => {
          setDetailOpen(false);
          setViewing(null);
        }}
        onEdit={(selectedTask) => {
          setDetailOpen(false);
          setViewing(null);
          setEditing(selectedTask);
          setDrawerOpen(true);
        }}
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
