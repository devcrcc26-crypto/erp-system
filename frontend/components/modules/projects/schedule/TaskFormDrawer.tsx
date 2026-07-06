'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Collapse,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import ProjectTeamUserSelect from '@/components/ui/ProjectTeamUserSelect/ProjectTeamUserSelect';
import type {
  ApprovalLevel,
  CompletionStatus,
  CreateTaskRequest,
  ProjectDesignStage,
  Task,
  TaskAttributes,
  TaskLanguage,
  TaskStatus,
  UrgencyLevel,
  UpdateTaskRequest,
} from '@/lib/api/project-management.types';
import {
  useCreateTask,
  useMilestones,
  useTaskDisciplines,
  useUpdateTask,
} from '@/lib/query/schedule';
import { useScheduleSubtasks } from '@/lib/query/schedule';
import { calculateTaskDurationDays } from '@/lib/utils/schedule-metrics';
import {
  nextStatusOptions,
  TASK_VALID_TRANSITIONS,
} from '@/lib/utils/pm-status-transitions';
import { formatTaskStatus } from '@/lib/utils/pm-status-display';
import { wideDetailDrawerProps } from '@/lib/theme/layout';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { PROJECT_DESIGN_STAGE_OPTIONS } from '@/lib/constants/project-design-stage';
import {
  ARCHIVING_OPTIONS,
  TASK_ATTRIBUTES_OPTIONS,
  TASK_REVIEW_LEVEL_OPTIONS,
  URGENCY_LEVEL_OPTIONS,
} from '@/lib/constants/task-comment8';
import { formatLocalizedName } from '@/lib/utils/bilingual-name';
import TaskDisciplinesEditor, {
  type TaskDisciplineDraft,
} from '@/components/modules/projects/schedule/TaskDisciplinesEditor';

const TASK_STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'DELAYED', label: 'Delayed' },
  { value: 'COMPLETED', label: 'Completed' },
];

const LANGUAGE_OPTIONS: Array<{ value: TaskLanguage; label: string }> = [
  { value: 'CHINESE', label: 'Chinese' },
  { value: 'ENGLISH', label: 'English' },
];

const COMPLETION_STATUS_OPTIONS: Array<{
  value: CompletionStatus;
  label: string;
}> = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'AHEAD', label: 'Ahead' },
  { value: 'BEHIND', label: 'Behind' },
];

interface TaskFormValues {
  taskIdCode?: string;
  name: string;
  nameZh?: string;
  description?: string;
  milestoneId?: string;
  dispatcherUserId?: string;
  assignedPersonUserId?: string;
  supervisingChiefUserId?: string;
  startDate?: Dayjs;
  finishDate?: Dayjs;
  durationDays?: number;
  progressPct?: number;
  status: TaskStatus;
  isCritical: boolean;
  urgencyLevel: UrgencyLevel;
  language: TaskLanguage;
  approvalLevel?: ApprovalLevel;
  designStage?: ProjectDesignStage;
  onSiteReceivingTime?: Dayjs;
  assignmentToHqTime?: Dayjs;
  contactFormNumber?: string;
  requiresArchiving: boolean;
  hasCustomSchedule: boolean;
  taskAttributes?: TaskAttributes;
  actualCompletionTime?: Dayjs;
  actualWorkdays?: number;
  completionStatus?: CompletionStatus;
  remark?: string;
}

function toExtendedPayload(
  values: TaskFormValues,
): Pick<
  CreateTaskRequest,
  | 'requiresArchiving'
  | 'taskAttributes'
  | 'onSiteReceivingTime'
  | 'assignmentToHqTime'
  | 'contactFormNumber'
  | 'designStage'
  | 'urgencyLevel'
  | 'hasCustomSchedule'
  | 'language'
  | 'approvalLevel'
  | 'dispatcherUserId'
  | 'assignedPersonUserId'
  | 'supervisingChiefUserId'
  | 'actualCompletionTime'
  | 'actualWorkdays'
  | 'completionStatus'
  | 'remark'
> {
  return {
    requiresArchiving: values.requiresArchiving,
    taskAttributes: values.taskAttributes,
    onSiteReceivingTime: values.onSiteReceivingTime?.toISOString(),
    assignmentToHqTime: values.assignmentToHqTime?.toISOString(),
    contactFormNumber: values.contactFormNumber?.trim() || undefined,
    designStage: values.designStage,
    urgencyLevel: values.urgencyLevel,
    hasCustomSchedule: values.hasCustomSchedule,
    language: values.language,
    approvalLevel: values.approvalLevel,
    dispatcherUserId: values.dispatcherUserId,
    assignedPersonUserId: values.assignedPersonUserId,
    supervisingChiefUserId: values.supervisingChiefUserId,
    actualCompletionTime: values.actualCompletionTime?.toISOString(),
    actualWorkdays: values.actualWorkdays,
    completionStatus: values.completionStatus,
    remark: values.remark?.trim() || undefined,
  };
}

function toFormValues(task: Task): TaskFormValues {
  return {
    taskIdCode: task.taskIdCode,
    name: task.name,
    nameZh: task.nameZh ?? undefined,
    description: task.description ?? undefined,
    milestoneId: task.milestoneId ?? undefined,
    dispatcherUserId: task.dispatcherUserId ?? undefined,
    assignedPersonUserId: task.assignedPersonUserId ?? undefined,
    supervisingChiefUserId: task.supervisingChiefUserId ?? undefined,
    startDate: task.startDate ? dayjs(task.startDate) : undefined,
    finishDate: task.finishDate ? dayjs(task.finishDate) : undefined,
    durationDays: task.durationDays ?? undefined,
    progressPct: task.progressPct,
    status: task.status,
    isCritical: task.isCritical,
    urgencyLevel: task.urgencyLevel,
    language: task.language,
    approvalLevel: task.approvalLevel ?? undefined,
    designStage: task.designStage ?? undefined,
    onSiteReceivingTime: task.onSiteReceivingTime
      ? dayjs(task.onSiteReceivingTime)
      : undefined,
    assignmentToHqTime: task.assignmentToHqTime
      ? dayjs(task.assignmentToHqTime)
      : undefined,
    contactFormNumber: task.contactFormNumber ?? undefined,
    requiresArchiving: task.requiresArchiving,
    hasCustomSchedule: task.hasCustomSchedule,
    taskAttributes: task.taskAttributes ?? undefined,
    actualCompletionTime: task.actualCompletionTime
      ? dayjs(task.actualCompletionTime)
      : undefined,
    actualWorkdays: task.actualWorkdays ?? undefined,
    completionStatus: task.completionStatus ?? undefined,
    remark: task.remark ?? undefined,
  };
}

function defaultFormValues(): Partial<TaskFormValues> {
  return {
    status: 'NOT_STARTED',
    progressPct: 0,
    isCritical: false,
    urgencyLevel: 'NORMAL',
    language: 'CHINESE',
    requiresArchiving: false,
    hasCustomSchedule: false,
  };
}

function durationFromFormDates(
  startDate?: Dayjs,
  finishDate?: Dayjs,
): number | undefined {
  const days = calculateTaskDurationDays(
    startDate?.toDate() ?? null,
    finishDate?.toDate() ?? null,
  );
  return days ?? undefined;
}

function syncDurationField(
  form: ReturnType<typeof Form.useForm<TaskFormValues>>[0],
  startDate?: Dayjs,
  finishDate?: Dayjs,
): void {
  form.setFieldValue('durationDays', durationFromFormDates(startDate, finishDate));
}

export default function TaskFormDrawer({
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
  const messageApi = useAppMessage();
  const milestonesQuery = useMilestones(projectId, { page: 1, limit: 50 }, open);
  const milestones = milestonesQuery.data?.data ?? [];
  const isEditing = Boolean(task);
  const disciplinesQuery = useTaskDisciplines(
    projectId,
    task?.id ?? '',
    open && isEditing && Boolean(task?.id),
  );
  const { byTaskId: subtasksByTaskId } = useScheduleSubtasks(
    projectId,
    open && isEditing,
  );

  const [disciplineDrafts, setDisciplineDrafts] = useState<TaskDisciplineDraft[]>(
    [],
  );
  const [removedDisciplineIds, setRemovedDisciplineIds] = useState<string[]>([]);
  const [initialDisciplineKeys, setInitialDisciplineKeys] = useState<string[]>(
    [],
  );

  const packageCountByDisciplineId = useMemo(() => {
    const map = new Map<string, number>();
    if (!task) {
      return map;
    }
    const subtasks = subtasksByTaskId.get(task.id) ?? [];
    for (const entry of subtasks) {
      map.set(
        entry.taskDisciplineId,
        (map.get(entry.taskDisciplineId) ?? 0) + 1,
      );
    }
    return map;
  }, [subtasksByTaskId, task]);

  const taskStatusOptions =
    isEditing && task
      ? nextStatusOptions(task.status, TASK_VALID_TRANSITIONS).map((status) => ({
          value: status,
          label: formatTaskStatus(status),
        }))
      : TASK_STATUS_OPTIONS;

  useEffect(() => {
    if (!open) {
      return;
    }

    if (task) {
      form.setFieldsValue(toFormValues(task));
      syncDurationField(
        form,
        form.getFieldValue('startDate'),
        form.getFieldValue('finishDate'),
      );
      return;
    }

    form.resetFields();
    form.setFieldsValue(defaultFormValues());
    setDisciplineDrafts([]);
    setRemovedDisciplineIds([]);
    setInitialDisciplineKeys([]);
  }, [open, task, form]);

  useEffect(() => {
    if (!open || !task || !disciplinesQuery.data) {
      return;
    }

    const drafts: TaskDisciplineDraft[] = disciplinesQuery.data
      .filter((discipline) => !removedDisciplineIds.includes(discipline.id))
      .map((discipline) => ({
        key: discipline.id,
        disciplineId: discipline.disciplineId ?? '',
        disciplineName: discipline.disciplineName,
        disciplineLeadUserId: discipline.disciplineLeadUserId ?? '',
        isExisting: true,
        packageCount: packageCountByDisciplineId.get(discipline.id) ?? 0,
      }));

    const newDrafts = disciplineDrafts.filter((entry) => !entry.isExisting);
    setDisciplineDrafts([...drafts, ...newDrafts]);
    setInitialDisciplineKeys(disciplinesQuery.data.map((entry) => entry.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when server disciplines load
  }, [open, task, disciplinesQuery.data, packageCountByDisciplineId]);

  function handleDisciplinesChange(next: TaskDisciplineDraft[]): void {
    if (task) {
      const removed = initialDisciplineKeys.filter(
        (id) => !next.some((entry) => entry.key === id),
      );
      setRemovedDisciplineIds(removed);
    }
    setDisciplineDrafts(next);
  }

  async function handleSubmit(values: TaskFormValues): Promise<void> {
    const durationDays = durationFromFormDates(values.startDate, values.finishDate);

    const base = {
      name: values.name.trim(),
      nameZh: values.nameZh?.trim() || undefined,
      description: values.description?.trim() || undefined,
      milestoneId: values.milestoneId,
      startDate: values.startDate?.toISOString(),
      finishDate: values.finishDate?.toISOString(),
      durationDays,
      progressPct: values.progressPct,
      status: values.status,
      isCritical: values.isCritical,
      ...toExtendedPayload(values),
    };

    const newDisciplines = disciplineDrafts
      .filter((entry) => !entry.isExisting)
      .map((entry) => ({
        disciplineId: entry.disciplineId,
        disciplineLeadUserId: entry.disciplineLeadUserId,
      }));

    try {
      if (task) {
        const body: UpdateTaskRequest = {
          ...base,
          taskIdCode: values.taskIdCode?.trim(),
          disciplinesToAdd:
            newDisciplines.length > 0 ? newDisciplines : undefined,
          disciplineIdsToRemove:
            removedDisciplineIds.length > 0 ? removedDisciplineIds : undefined,
        };
        await updateTask.mutateAsync({ projectId, taskId: task.id, body });
        messageApi.success('Task updated successfully');
      } else {
        const body: CreateTaskRequest = {
          ...base,
          disciplines: newDisciplines.length > 0 ? newDisciplines : undefined,
        };
        await createTask.mutateAsync({ projectId, body });
        messageApi.success('Task created successfully');
      }

      form.resetFields();
      setDisciplineDrafts([]);
      setRemovedDisciplineIds([]);
      onSaved?.();
      onClose();
    } catch (error) {
      notifyApiError(
        error,
        task ? 'Failed to update task' : 'Failed to create task',
        messageApi,
      );
    }
  }

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      title={
        isEditing && task
          ? formatLocalizedName(task)
          : isEditing
            ? 'Edit task'
            : 'Add task'
      }
      onClose={onClose}
    >
      <Form<TaskFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        onValuesChange={(
          changed: Partial<TaskFormValues>,
          allValues: TaskFormValues,
        ) => {
          if ('startDate' in changed || 'finishDate' in changed) {
            syncDurationField(form, allValues.startDate, allValues.finishDate);
          }
        }}
        onFinish={(values: TaskFormValues) => void handleSubmit(values)}
      >
        {isEditing && task && (
          <div className="mb-4 grid gap-4 md:grid-cols-2 md:gap-x-4">
            <Form.Item label="Task ID" name="taskIdCode">
              <Input disabled />
            </Form.Item>
            {taskStatusOptions.length > 0 ? (
              <Form.Item
                label="Status"
                name="status"
                rules={[{ required: true, message: 'Status is required' }]}
              >
                <Select options={taskStatusOptions} />
              </Form.Item>
            ) : (
              <Form.Item label="Status">
                <Input disabled value={formatTaskStatus(task.status)} />
              </Form.Item>
            )}
          </div>
        )}

        {!isEditing && (
          <Form.Item
            label="Status"
            name="status"
            rules={[{ required: true, message: 'Status is required' }]}
            className="hidden"
          >
            <Select options={TASK_STATUS_OPTIONS} />
          </Form.Item>
        )}

        <Collapse
          bordered={false}
          className="erp-schedule-collapse bg-transparent"
          defaultActiveKey={['basic']}
          items={[
            {
              key: 'basic',
              label: 'Basic',
              children: (
                <>
                  <Form.Item
                    label="Name"
                    name="name"
                    rules={[{ required: true, message: 'Name is required' }]}
                  >
                    <Input placeholder="Task name" />
                  </Form.Item>
                  <Form.Item label="Chinese name (optional)" name="nameZh">
                    <Input placeholder="任务中文名称" />
                  </Form.Item>
                  <Form.Item label="Main work content" name="description">
                    <Input.TextArea rows={2} />
                  </Form.Item>
                  <Form.Item label="Design stage" name="designStage">
                    <Select
                      allowClear
                      placeholder="Select design stage"
                      options={PROJECT_DESIGN_STAGE_OPTIONS}
                    />
                  </Form.Item>
                  <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
                    <Form.Item label="Planned start" name="startDate">
                      <DatePicker className="w-full" />
                    </Form.Item>
                    <Form.Item
                      label="Planned finish"
                      name="finishDate"
                      rules={[
                        ({ getFieldValue }) => ({
                          validator(_rule, value: Dayjs | undefined) {
                            const start = getFieldValue('startDate') as
                              | Dayjs
                              | undefined;
                            if (!value || !start || !value.isBefore(start, 'day')) {
                              return Promise.resolve();
                            }
                            return Promise.reject(
                              new Error('Finish date cannot be before start date'),
                            );
                          },
                        }),
                      ]}
                    >
                      <DatePicker className="w-full" />
                    </Form.Item>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
                    <Form.Item label="Dispatcher" name="dispatcherUserId">
                      <ProjectTeamUserSelect projectId={projectId} />
                    </Form.Item>
                    <Form.Item label="Assigned person" name="assignedPersonUserId">
                      <ProjectTeamUserSelect projectId={projectId} />
                    </Form.Item>
                  </div>
                  {isEditing && (
                    <>
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
                      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
                        <Form.Item
                          label="Duration (days)"
                          name="durationDays"
                          tooltip="Calculated from start and finish dates (inclusive)."
                        >
                          <InputNumber className="!w-full" min={0} disabled />
                        </Form.Item>
                        <Form.Item label="Progress %" name="progressPct">
                          <InputNumber className="!w-full" min={0} max={100} />
                        </Form.Item>
                      </div>
                      <Form.Item name="isCritical" valuePropName="checked">
                        <Checkbox>Critical path task</Checkbox>
                      </Form.Item>
                    </>
                  )}
                </>
              ),
            },
            {
              key: 'details',
              label: 'Task details',
              children: (
                <>
                  <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
                    <Form.Item label="Task attributes" name="taskAttributes">
                      <Select
                        allowClear
                        options={TASK_ATTRIBUTES_OPTIONS}
                      />
                    </Form.Item>
                    <Form.Item label="Urgency level" name="urgencyLevel">
                      <Select options={URGENCY_LEVEL_OPTIONS} />
                    </Form.Item>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
                    <Form.Item label="Task review level" name="approvalLevel">
                      <Select
                        allowClear
                        options={TASK_REVIEW_LEVEL_OPTIONS}
                      />
                    </Form.Item>
                    <Form.Item label="Form of archiving" name="requiresArchiving">
                      <Select
                        options={ARCHIVING_OPTIONS.map((option) => ({
                          value: option.value,
                          label: option.label,
                        }))}
                      />
                    </Form.Item>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
                    <Form.Item label="Language" name="language">
                      <Select options={LANGUAGE_OPTIONS} />
                    </Form.Item>
                    <Form.Item
                      label="Work plan made"
                      name="hasCustomSchedule"
                      valuePropName="checked"
                    >
                      <Switch checkedChildren="Yes" unCheckedChildren="No" />
                    </Form.Item>
                  </div>
                  <Form.Item label="Contact sheet number" name="contactFormNumber">
                    <Input />
                  </Form.Item>
                  <Form.Item
                    label="Supervising chief"
                    name="supervisingChiefUserId"
                  >
                    <ProjectTeamUserSelect projectId={projectId} />
                  </Form.Item>
                  {isEditing && (
                    <>
                      <Form.Item label="Completion status" name="completionStatus">
                        <Select allowClear options={COMPLETION_STATUS_OPTIONS} />
                      </Form.Item>
                      <Form.Item label="Remark" name="remark">
                        <Input.TextArea rows={2} />
                      </Form.Item>
                    </>
                  )}
                </>
              ),
            },
            {
              key: 'dates',
              label: 'Dates',
              children: (
                <>
                  <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
                    <Form.Item
                      label="On-site receiving time"
                      name="onSiteReceivingTime"
                    >
                      <DatePicker className="w-full" showTime />
                    </Form.Item>
                    <Form.Item
                      label="HQ assignment time"
                      name="assignmentToHqTime"
                    >
                      <DatePicker className="w-full" showTime />
                    </Form.Item>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
                    <Form.Item label="Planned completion" name="finishDate">
                      <DatePicker className="w-full" />
                    </Form.Item>
                    <Form.Item
                      label="Actual completion"
                      name="actualCompletionTime"
                    >
                      <DatePicker className="w-full" showTime />
                    </Form.Item>
                  </div>
                  {isEditing && (
                    <Form.Item label="Actual workdays" name="actualWorkdays">
                      <InputNumber className="!w-full" min={0} />
                    </Form.Item>
                  )}
                </>
              ),
            },
          ]}
        />

        <div className="mt-4">
          <TaskDisciplinesEditor
            projectId={projectId}
            disciplines={disciplineDrafts}
            onChange={handleDisciplinesChange}
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
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
