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
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import type {
  ApprovalLevel,
  CommissionMode,
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
import { useProject } from '@/lib/query/projects';
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
import { COMMISSION_MODE_OPTIONS } from '@/lib/constants/commission-mode';
import {
  ARCHIVING_OPTIONS,
  TASK_ATTRIBUTES_OPTIONS,
  TASK_REVIEW_LEVEL_OPTIONS,
  URGENCY_LEVEL_OPTIONS,
} from '@/lib/constants/task-comment8';
import { formatLocalizedName } from '@/lib/utils/bilingual-name';
import { DISPATCHER_IDS } from '@/lib/constants/dispatcher';
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
  overseasTaskNumber?: string;
  name: string;
  nameZh?: string;
  description?: string;
  milestoneId?: string;
  dispatcherUserId?: string;
  supervisingChiefUserId?: string;
  startDate?: Dayjs;
  finishDate?: Dayjs;
  durationDays?: number;
  progressPct?: number;
  status: TaskStatus;
  isCritical: boolean;
  commissionMode?: CommissionMode;
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
  | 'supervisingChiefUserId'
  | 'commissionMode'
  | 'actualCompletionTime'
  | 'actualWorkdays'
  | 'completionStatus'
  | 'remark'
> {
  return {
    requiresArchiving: values.requiresArchiving,
    taskAttributes: values.taskAttributes,
    onSiteReceivingTime: values.onSiteReceivingTime
      ?.startOf('day')
      .toISOString(),
    assignmentToHqTime: values.assignmentToHqTime
      ?.startOf('day')
      .toISOString(),
    contactFormNumber: values.contactFormNumber?.trim() || undefined,
    designStage: values.designStage,
    urgencyLevel: values.urgencyLevel,
    hasCustomSchedule: values.hasCustomSchedule,
    language: values.language,
    approvalLevel: values.approvalLevel,
    dispatcherUserId: values.dispatcherUserId,
    supervisingChiefUserId: values.supervisingChiefUserId,
    commissionMode: values.commissionMode,
    actualCompletionTime: values.actualCompletionTime?.toISOString(),
    actualWorkdays: values.actualWorkdays,
    completionStatus: values.completionStatus,
    remark: values.remark?.trim() || undefined,
  };
}

function toFormValues(task: Task): TaskFormValues {
  return {
    taskIdCode: task.taskIdCode,
    overseasTaskNumber: task.overseasTaskNumber ?? undefined,
    name: task.name,
    nameZh: task.nameZh ?? undefined,
    description: task.description ?? undefined,
    milestoneId: task.milestoneId ?? undefined,
    dispatcherUserId: task.dispatcherUserId ?? undefined,
    supervisingChiefUserId: task.supervisingChiefUserId ?? undefined,
    startDate: task.startDate ? dayjs(task.startDate) : undefined,
    finishDate: task.finishDate ? dayjs(task.finishDate) : undefined,
    durationDays: task.durationDays ?? undefined,
    progressPct: task.progressPct,
    status: task.status,
    isCritical: task.isCritical,
    commissionMode: task.commissionMode ?? undefined,
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

function defaultFormValues(
  projectDesignStage?: ProjectDesignStage | null,
  projectContractType?: CommissionMode | null,
): Partial<TaskFormValues> {
  return {
    status: 'NOT_STARTED',
    progressPct: 0,
    isCritical: false,
    urgencyLevel: 'NORMAL',
    language: 'CHINESE',
    requiresArchiving: false,
    hasCustomSchedule: false,
    designStage: projectDesignStage ?? undefined,
    commissionMode: projectContractType ?? undefined,
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

function disciplineDraftsMatch(
  current: TaskDisciplineDraft[],
  next: TaskDisciplineDraft[],
): boolean {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((entry, index) => {
    const other = next[index];
    return (
      entry.key === other.key &&
      entry.disciplineId === other.disciplineId &&
      entry.disciplineName === other.disciplineName &&
      entry.disciplineLeadUserId === other.disciplineLeadUserId &&
      entry.isExisting === other.isExisting
    );
  });
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
  const projectQuery = useProject(projectId, open);
  const milestonesQuery = useMilestones(projectId, { page: 1, limit: 50 }, open);
  const disciplinesQuery = useTaskDisciplines(
    projectId,
    task?.id ?? '',
    open && Boolean(task),
  );
  const { byTaskId: subtasksByTaskId } = useScheduleSubtasks(
    projectId,
    open && Boolean(task),
  );
  const [disciplineDrafts, setDisciplineDrafts] = useState<TaskDisciplineDraft[]>(
    [],
  );
  const [removedDisciplineIds, setRemovedDisciplineIds] = useState<string[]>([]);
  const [initialDisciplineKeys, setInitialDisciplineKeys] = useState<string[]>(
    [],
  );

  const isEditing = Boolean(task);
  const milestones = milestonesQuery.data?.data ?? [];
  const watchedStatus = Form.useWatch('status', form);

  const packageCountByDisciplineId = useMemo(() => {
    const map = new Map<string, number>();
    if (!task) {
      return map;
    }
    const entries = subtasksByTaskId.get(task.id) ?? [];
    for (const entry of entries) {
      map.set(
        entry.taskDisciplineId,
        (map.get(entry.taskDisciplineId) ?? 0) + 1,
      );
    }
    return map;
  }, [subtasksByTaskId, task?.id]);

  const disciplineDraftsWithCounts = useMemo(
    () =>
      disciplineDrafts.map((entry) => {
        if (!entry.isExisting) {
          return entry;
        }
        return {
          ...entry,
          packageCount: packageCountByDisciplineId.get(entry.key) ?? 0,
        };
      }),
    [disciplineDrafts, packageCountByDisciplineId],
  );

  const statusOptions = isEditing
    ? nextStatusOptions(task!.status, TASK_VALID_TRANSITIONS).map((status) => ({
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
    form.setFieldsValue(
      defaultFormValues(
        projectQuery.data?.designStage,
        projectQuery.data?.contractType,
      ),
    );
    setDisciplineDrafts([]);
    setRemovedDisciplineIds([]);
    setInitialDisciplineKeys([]);
  }, [open, task?.id, form, projectQuery.data?.designStage, projectQuery.data?.contractType]);

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
      }));

    setDisciplineDrafts((prev) => {
      const newDrafts = prev.filter((entry) => !entry.isExisting);
      const next = [...drafts, ...newDrafts];
      return disciplineDraftsMatch(prev, next) ? prev : next;
    });
    setInitialDisciplineKeys(disciplinesQuery.data.map((entry) => entry.id));
  }, [open, task?.id, disciplinesQuery.data, removedDisciplineIds]);

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
    if (values.status === 'NOT_STARTED' && values.actualCompletionTime) {
      messageApi.error(
        'Actual completion time cannot be set while status is Not started.',
      );
      return;
    }

    const durationDays = durationFromFormDates(values.startDate, values.finishDate);

    const base = {
      name: values.name.trim(),
      nameZh: values.nameZh?.trim() || undefined,
      description: values.description?.trim() || undefined,
      milestoneId: values.milestoneId,
      overseasTaskNumber: values.overseasTaskNumber?.trim() || undefined,
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
      title={isEditing ? `Edit task - ${formatLocalizedName(task!)}` : 'Add task'}
      onClose={onClose}
      extra={
        <Button type="primary" onClick={() => form.submit()}>
          {isEditing ? 'Save task' : 'Create task'}
        </Button>
      }
      destroyOnHidden
    >
      <Form<TaskFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        onFinish={(values) => void handleSubmit(values)}
        onValuesChange={(changed, allValues) => {
          if ('startDate' in changed || 'finishDate' in changed) {
            syncDurationField(form, allValues.startDate, allValues.finishDate);
          }
        }}
      >
        <Collapse
          bordered={false}
          className="erp-schedule-collapse bg-transparent"
          defaultActiveKey={['basic', 'dates', 'details', 'disciplines']}
          items={[
            {
              key: 'basic',
              label: 'Basic',
              children: (
                <>
                  {isEditing && (
                    <Form.Item label="Task ID" name="taskIdCode">
                      <Input disabled />
                    </Form.Item>
                  )}
                  <Form.Item label="Overseas task number" name="overseasTaskNumber">
                    <Input placeholder="Manual entry" />
                  </Form.Item>
                  <Form.Item
                    label="Task name"
                    name="name"
                    rules={[{ required: true, message: 'Task name is required' }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item label="Chinese name" name="nameZh">
                    <Input />
                  </Form.Item>
                  <Form.Item label="Main work content" name="description">
                    <Input.TextArea rows={3} />
                  </Form.Item>
                  <Form.Item label="Status" name="status">
                    <Select options={statusOptions} />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'dates',
              label: 'Dates & assignment',
              children: (
                <>
                  <Form.Item label="Design stage" name="designStage">
                    <Select
                      allowClear
                      placeholder="Select design stage"
                      options={PROJECT_DESIGN_STAGE_OPTIONS}
                    />
                  </Form.Item>
                  <Form.Item label="Commission mode" name="commissionMode">
                    <Select
                      allowClear
                      placeholder="Select commission mode"
                      options={COMMISSION_MODE_OPTIONS}
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
                  <Form.Item label="Dispatcher (调度员)" name="dispatcherUserId">
                    <ProjectTeamUserSelect
                      projectId={projectId}
                      restrictToUserIds={DISPATCHER_IDS}
                    />
                  </Form.Item>
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
                      <Select allowClear options={TASK_ATTRIBUTES_OPTIONS} />
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
                  {projectQuery.data?.contractType === 'CONTRACT' && (
                    <Form.Item label="Contact sheet number" name="contactFormNumber">
                      <Input />
                    </Form.Item>
                  )}
                  <Form.Item
                    label="Responsible Person"
                    name="supervisingChiefUserId"
                  >
                    <UserSelect />
                  </Form.Item>
                  <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
                    <Form.Item label="On-site receiving time" name="onSiteReceivingTime">
                      <DatePicker className="w-full" />
                    </Form.Item>
                    <Form.Item label="HQ assignment time" name="assignmentToHqTime">
                      <DatePicker className="w-full" />
                    </Form.Item>
                  </div>
                  {isEditing && (
                    <>
                      <Form.Item
                        label="Actual completion"
                        name="actualCompletionTime"
                        rules={[
                          {
                            validator(_rule, value: Dayjs | undefined) {
                              const status = form.getFieldValue('status') as TaskStatus;
                              if (status === 'NOT_STARTED' && value) {
                                return Promise.reject(
                                  new Error(
                                    'Cannot set actual completion while status is Not started',
                                  ),
                                );
                              }
                              return Promise.resolve();
                            },
                          },
                        ]}
                      >
                        <DatePicker
                          showTime
                          className="w-full"
                          disabled={watchedStatus === 'NOT_STARTED'}
                        />
                      </Form.Item>
                      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
                        <Form.Item label="Actual workdays" name="actualWorkdays">
                          <InputNumber className="!w-full" min={0} />
                        </Form.Item>
                        <Form.Item label="Completion status" name="completionStatus">
                          <Select
                            allowClear
                            options={COMPLETION_STATUS_OPTIONS}
                          />
                        </Form.Item>
                      </div>
                      <Form.Item label="Remark" name="remark">
                        <Input.TextArea rows={2} />
                      </Form.Item>
                    </>
                  )}
                </>
              ),
            },
            {
              key: 'disciplines',
              label: 'Disciplines',
              children: (
                <TaskDisciplinesEditor
                  disciplines={disciplineDraftsWithCounts}
                  onChange={handleDisciplinesChange}
                />
              ),
            },
          ]}
        />
      </Form>
    </Drawer>
  );
}
