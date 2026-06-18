'use client';

import { useEffect } from 'react';
import {
  Alert,
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
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  CreateProjectRequest,
  Project,
  ProjectStatus,
  ProjectType,
  UpdateProjectRequest,
} from '@/lib/api/project-management.types';
import { PROJECT_STATUS_WORKFLOW } from '@/lib/api/workflow';
import { useCreateProject, useUpdateProject } from '@/lib/query/projects';

const PROJECT_TYPE_OPTIONS: Array<{ value: ProjectType; label: string }> = [
  { value: 'RESIDENTIAL', label: 'Residential' },
  { value: 'COMMERCIAL', label: 'Commercial' },
  { value: 'INFRASTRUCTURE', label: 'Infrastructure' },
  { value: 'INDUSTRIAL', label: 'Industrial' },
];

interface ProjectFormValues {
  projectCode: string;
  name: string;
  location?: string;
  projectType?: ProjectType;
  contractType?: string;
  status?: ProjectStatus;
  startDate?: Dayjs;
  plannedFinishDate?: Dayjs;
  actualFinishDate?: Dayjs;
  budget?: number;
  currency?: string;
  projectManagerId?: string;
  client?: string;
  commissioningMethod?: string;
  responsibleDepartmentId?: string;
  designProperties?: string;
  designStage?: string;
  responsiblePersonId?: string;
  description?: string;
  overallProgressPct?: number;
  isOutsourced?: boolean;
}

function toFormValues(project: Project): ProjectFormValues {
  return {
    projectCode: project.projectCode,
    name: project.name,
    location: project.location ?? undefined,
    projectType: project.projectType ?? undefined,
    contractType: project.contractType ?? undefined,
    status: project.status,
    startDate: project.startDate ? dayjs(project.startDate) : undefined,
    plannedFinishDate: project.plannedFinishDate
      ? dayjs(project.plannedFinishDate)
      : undefined,
    actualFinishDate: project.actualFinishDate
      ? dayjs(project.actualFinishDate)
      : undefined,
    budget: project.budget ? Number(project.budget) : undefined,
    currency: project.currency ?? undefined,
    projectManagerId: project.projectManagerId ?? undefined,
    client: project.client ?? undefined,
    commissioningMethod: project.commissioningMethod ?? undefined,
    responsibleDepartmentId: project.responsibleDepartmentId ?? undefined,
    designProperties: project.designProperties ?? undefined,
    designStage: project.designStage ?? undefined,
    responsiblePersonId: project.responsiblePersonId ?? undefined,
    description: project.description ?? undefined,
    overallProgressPct: project.overallProgressPct,
    isOutsourced: project.isOutsourced,
  };
}

function toCreatePayload(values: ProjectFormValues): CreateProjectRequest {
  return {
    projectCode: values.projectCode.trim(),
    name: values.name.trim(),
    location: values.location?.trim() || undefined,
    projectType: values.projectType,
    contractType: values.contractType?.trim() || undefined,
    status: values.status,
    startDate: values.startDate?.toISOString(),
    plannedFinishDate: values.plannedFinishDate?.toISOString(),
    budget: values.budget,
    currency: values.currency?.trim() || undefined,
    projectManagerId: values.projectManagerId,
    client: values.client?.trim() || undefined,
    commissioningMethod: values.commissioningMethod?.trim() || undefined,
    responsibleDepartmentId: values.responsibleDepartmentId?.trim() || undefined,
    designProperties: values.designProperties?.trim() || undefined,
    designStage: values.designStage?.trim() || undefined,
    responsiblePersonId: values.responsiblePersonId,
    description: values.description?.trim() || undefined,
    overallProgressPct: values.overallProgressPct,
    isOutsourced: values.isOutsourced,
  };
}

function toUpdatePayload(values: ProjectFormValues): UpdateProjectRequest {
  return {
    ...toCreatePayload(values),
    actualFinishDate: values.actualFinishDate?.toISOString(),
  };
}

export default function ProjectFormDrawer({
  open,
  project,
  onClose,
  onSaved,
}: {
  open: boolean;
  project?: Project;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<ProjectFormValues>();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const isEditing = Boolean(project);
  const isSubmitting = createProject.isPending || updateProject.isPending;

  useEffect(() => {
    if (!open) {
      return;
    }
    if (project) {
      form.setFieldsValue(toFormValues(project));
      return;
    }
    form.resetFields();
    form.setFieldsValue({
      status: 'PLANNING',
      currency: 'USD',
      overallProgressPct: 0,
      isOutsourced: false,
    });
  }, [open, project, form]);

  async function handleSubmit(values: ProjectFormValues): Promise<void> {
    try {
      if (project) {
        await updateProject.mutateAsync({
          projectId: project.id,
          body: toUpdatePayload(values),
        });
      } else {
        await createProject.mutateAsync(toCreatePayload(values));
      }
      onSaved();
      onClose();
    } catch (error) {
      const message =
        error instanceof ApiRequestError
          ? error.message
          : 'Failed to save project.';
      form.setFields([{ name: 'name', errors: [message] }]);
    }
  }

  return (
    <Drawer
      open={open}
      title={isEditing ? 'Edit project' : 'New project'}
      onClose={onClose}
      size="large"
      destroyOnHidden
      extra={null}
      footer={null}
    >
      <Form<ProjectFormValues>
        form={form}
        layout="vertical"
        onFinish={(values: ProjectFormValues) => void handleSubmit(values)}
      >
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="Project code"
            name="projectCode"
            rules={[{ required: true, message: 'Project code is required' }]}
          >
            <Input placeholder="e.g. PRJ-2026-001" disabled={isEditing} />
          </Form.Item>
          <Form.Item
            label="Status"
            name="status"
            rules={[{ required: true, message: 'Status is required' }]}
          >
            <Select
              options={PROJECT_STATUS_WORKFLOW.map((step) => ({
                value: step.key,
                label: step.label,
              }))}
            />
          </Form.Item>
        </div>

        <Form.Item
          label="Project name"
          name="name"
          rules={[{ required: true, message: 'Project name is required' }]}
        >
          <Input placeholder="Project name" />
        </Form.Item>

        <Form.Item label="Location" name="location">
          <Input placeholder="Site location" />
        </Form.Item>

        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Project type" name="projectType">
            <Select
              allowClear
              placeholder="Select type"
              options={PROJECT_TYPE_OPTIONS}
            />
          </Form.Item>
          <Form.Item label="Contract type" name="contractType">
            <Input placeholder="e.g. Lump sum" />
          </Form.Item>
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Start date" name="startDate">
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item label="Planned finish" name="plannedFinishDate">
            <DatePicker className="w-full" />
          </Form.Item>
        </div>

        {isEditing && (
          <Form.Item label="Actual finish" name="actualFinishDate">
            <DatePicker className="w-full" />
          </Form.Item>
        )}

        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Budget" name="budget">
            <InputNumber className="!w-full" min={0} placeholder="0" />
          </Form.Item>
          <Form.Item label="Currency" name="currency">
            <Input placeholder="USD" maxLength={3} />
          </Form.Item>
        </div>

        <Form.Item label="Project manager" name="projectManagerId">
          <UserSelect placeholder="Assign project manager" />
        </Form.Item>

        <Divider orientation="left">Project Details</Divider>

        <Form.Item label="Client" name="client">
          <Input placeholder="Client name" />
        </Form.Item>
        <Form.Item label="Commissioning method" name="commissioningMethod">
          <Input />
        </Form.Item>
        <Form.Item
          label="Responsible department ID"
          name="responsibleDepartmentId"
          extra="Enter department UUID until department picker is available."
        >
          <Input placeholder="Department UUID" />
        </Form.Item>
        <Form.Item label="Design properties" name="designProperties">
          <Input />
        </Form.Item>
        <Form.Item label="Design stage" name="designStage">
          <Input />
        </Form.Item>
        <Form.Item label="Responsible person" name="responsiblePersonId">
          <UserSelect placeholder="Assign responsible person" />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input.TextArea rows={3} />
        </Form.Item>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Overall progress %" name="overallProgressPct">
            <InputNumber className="!w-full" min={0} max={100} />
          </Form.Item>
          <Form.Item
            label="Outsourced"
            name="isOutsourced"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </div>

        {isSubmitting && (
          <Alert type="info" showIcon title="Saving project..." className="!mb-4" />
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {isEditing ? 'Save changes' : 'Create project'}
          </button>
        </div>
      </Form>
    </Drawer>
  );
}
