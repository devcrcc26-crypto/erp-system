'use client';

import { useEffect } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Divider,
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
  Task,
  TaskLanguage,
  TaskStatus,
  UrgencyLevel,
  UpdateTaskRequest,
} from '@/lib/api/project-management.types';
import {
  useCreateTask,
  useMilestones,
  useUpdateTask,
} from '@/lib/query/schedule';
import { calculateTaskDurationDays } from '@/lib/utils/schedule-metrics';
import { antDrawerBodyStyles } from '@/lib/theme/layout';

const TASK_STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'DELAYED', label: 'Delayed' },
  { value: 'COMPLETED', label: 'Completed' },
];

const URGENCY_OPTIONS: Array<{ value: UrgencyLevel; label: string }> = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'CRITICAL', label: 'Critical' },
];

const LANGUAGE_OPTIONS: Array<{ value: TaskLanguage; label: string }> = [
  { value: 'CHINESE', label: 'Chinese' },
  { value: 'ENGLISH', label: 'English' },
];

const APPROVAL_LEVEL_OPTIONS: Array<{ value: ApprovalLevel; label: string }> = [
  { value: 'DEPARTMENT', label: 'Department' },
  { value: 'INSTITUTE', label: 'Institute' },
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
  description?: string;
  milestoneId?: string;
  dispatcherUserId?: string;
  instituteChiefUserId?: string;
  startDate?: Dayjs;
  finishDate?: Dayjs;
  durationDays?: number;
  progressPct?: number;
  status: TaskStatus;
  isCritical: boolean;
  urgencyLevel: UrgencyLevel;
  language: TaskLanguage;
  approvalLevel?: ApprovalLevel;
  designStage?: string;
  commissioningMethod?: string;
  onSiteReceivingTime?: Dayjs;
  assignmentToHqTime?: Dayjs;
  contactFormNumber?: string;
  requiresArchiving: boolean;
  hasCustomSchedule: boolean;
  taskAttributes?: string;
  actualCompletionTime?: Dayjs;
  actualWorkdays?: number;
  completionStatus?: CompletionStatus;
  remark?: string;
}

function toExtendedPayload(
  values: TaskFormValues,
): Pick<
  CreateTaskRequest,
  | 'commissioningMethod'
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
  | 'instituteChiefUserId'
  | 'actualCompletionTime'
  | 'actualWorkdays'
  | 'completionStatus'
  | 'remark'
> {
  return {
    commissioningMethod: values.commissioningMethod?.trim() || undefined,
    requiresArchiving: values.requiresArchiving,
    taskAttributes: values.taskAttributes?.trim() || undefined,
    onSiteReceivingTime: values.onSiteReceivingTime?.toISOString(),
    assignmentToHqTime: values.assignmentToHqTime?.toISOString(),
    contactFormNumber: values.contactFormNumber?.trim() || undefined,
    designStage: values.designStage?.trim() || undefined,
    urgencyLevel: values.urgencyLevel,
    hasCustomSchedule: values.hasCustomSchedule,
    language: values.language,
    approvalLevel: values.approvalLevel,
    dispatcherUserId: values.dispatcherUserId,
    instituteChiefUserId: values.instituteChiefUserId,
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
    description: task.description ?? undefined,
    milestoneId: task.milestoneId ?? undefined,
    dispatcherUserId: task.dispatcherUserId ?? undefined,
    instituteChiefUserId: task.instituteChiefUserId ?? undefined,
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
    commissioningMethod: task.commissioningMethod ?? undefined,
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
  const milestonesQuery = useMilestones(projectId, { page: 1, limit: 50 }, open);
  const milestones = milestonesQuery.data?.data ?? [];
  const isEditing = Boolean(task);

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
  }, [open, task, form]);

  async function handleSubmit(values: TaskFormValues): Promise<void> {
    const durationDays = durationFromFormDates(values.startDate, values.finishDate);

    const base = {
      name: values.name.trim(),
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

    if (task) {
      const body: UpdateTaskRequest = {
        ...base,
        taskIdCode: values.taskIdCode?.trim(),
      };
      await updateTask.mutateAsync({ projectId, taskId: task.id, body });
    } else {
      const body: CreateTaskRequest = base;
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
      styles={antDrawerBodyStyles}
    >
      <div className="flex flex-col gap-6">
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
        {isEditing && (
          <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
            <Form.Item label="Task ID" name="taskIdCode">
              <Input disabled />
            </Form.Item>
            <Form.Item
              label="Status"
              name="status"
              rules={[{ required: true, message: 'Status is required' }]}
            >
              <Select options={TASK_STATUS_OPTIONS} />
            </Form.Item>
          </div>
        )}

        {!isEditing && (
          <Form.Item
            label="Status"
            name="status"
            rules={[{ required: true, message: 'Status is required' }]}
          >
            <Select options={TASK_STATUS_OPTIONS} />
          </Form.Item>
        )}

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
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Dispatcher" name="dispatcherUserId">
            <ProjectTeamUserSelect projectId={projectId} />
          </Form.Item>
          <Form.Item label="Institute chief engineer" name="instituteChiefUserId">
            <ProjectTeamUserSelect projectId={projectId} />
          </Form.Item>
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Start date" name="startDate">
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item
            label="Finish date"
            name="finishDate"
            rules={[
              ({ getFieldValue }) => ({
                validator(_rule, value: Dayjs | undefined) {
                  const start = getFieldValue('startDate') as Dayjs | undefined;
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

        <Divider titlePlacement="left">Extended Fields</Divider>

        <div className="grid gap-4 md:grid-cols-3 md:gap-x-4">
          <Form.Item label="Urgency" name="urgencyLevel">
            <Select options={URGENCY_OPTIONS} />
          </Form.Item>
          <Form.Item label="Language" name="language">
            <Select options={LANGUAGE_OPTIONS} />
          </Form.Item>
          <Form.Item label="Approval level" name="approvalLevel">
            <Select allowClear options={APPROVAL_LEVEL_OPTIONS} />
          </Form.Item>
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Design stage" name="designStage">
            <Input />
          </Form.Item>
          <Form.Item label="Commissioning method" name="commissioningMethod">
            <Input />
          </Form.Item>
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="On-site receiving time" name="onSiteReceivingTime">
            <DatePicker className="w-full" showTime />
          </Form.Item>
          <Form.Item label="Assignment to HQ time" name="assignmentToHqTime">
            <DatePicker className="w-full" showTime />
          </Form.Item>
        </div>
        <Form.Item label="Contact form number" name="contactFormNumber">
          <Input />
        </Form.Item>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="Requires archiving"
            name="requiresArchiving"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            label="Custom schedule"
            name="hasCustomSchedule"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </div>
        <Form.Item label="Task attributes" name="taskAttributes">
          <Input />
        </Form.Item>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Actual completion time" name="actualCompletionTime">
            <DatePicker className="w-full" showTime />
          </Form.Item>
          <Form.Item label="Actual workdays" name="actualWorkdays">
            <InputNumber className="!w-full" min={0} />
          </Form.Item>
        </div>
        <Form.Item label="Completion status" name="completionStatus">
          <Select allowClear options={COMPLETION_STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item label="Remark" name="remark">
          <Input.TextArea rows={2} />
        </Form.Item>

        <div className="flex justify-end gap-3 pt-2">
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
      </div>
    </Drawer>
  );
}
