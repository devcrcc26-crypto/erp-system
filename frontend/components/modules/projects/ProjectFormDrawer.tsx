// UI polish pass - styles only, no logic changes

'use client';

import {
  Button,
  AutoComplete,
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
  ProjectContractType,
  ProjectType,
  UpdateProjectRequest,
} from '@/lib/api/project-management.types';
import type { ProjectStatus } from '@/lib/constants/project-status';
import { PROJECT_STATUS_DEFAULT } from '@/lib/constants/project-status';
import {
  PROJECT_CONTRACT_TYPE_DEFAULT,
  PROJECT_CONTRACT_TYPE_OPTIONS,
} from '@/lib/constants/project-contract-type';
import {
  PROJECT_RESPONSIBLE_DEPARTMENT_DEFAULT,
  PROJECT_RESPONSIBLE_DEPARTMENT_OPTIONS,
} from '@/lib/constants/project-responsible-department';
import {
  PROJECT_DESIGN_PROPERTIES_DEFAULT,
  PROJECT_DESIGN_PROPERTIES_OPTIONS,
} from '@/lib/constants/project-design-properties';
import type { ProjectDesignProperties } from '@/lib/constants/project-design-properties';
import type { ProjectResponsibleDepartment } from '@/lib/constants/project-responsible-department';
import { PROJECT_CLIENT_PRESET_OPTIONS } from '@/lib/constants/project-client-presets';
import { PROJECT_STATUS_WORKFLOW } from '@/lib/api/workflow';
import {
  PROJECT_DESIGN_STAGE_DEFAULT,
  PROJECT_DESIGN_STAGE_OPTIONS,
} from '@/lib/constants/project-design-stage';
import type { ProjectDesignStage } from '@/lib/constants/project-design-stage';
import {
  PROJECT_TYPE_OPTIONS,
} from '@/lib/utils/project-display';
import { getFieldsForProjectType } from '@/lib/constants/project-type-fields';
import { wideDetailDrawerProps } from '@/lib/theme/layout';
import { useCreateProject, useUpdateProject } from '@/lib/query/projects';

interface ProjectFormValues {
  projectCode: string;
  name: string;
  nameZh?: string;
  location?: string;
  projectType?: ProjectType;
  railwayLengthKm?: number;
  urbanRailLengthKm?: number;
  roadLengthKm?: number;
  grossFloorAreaM2?: number;
  contractType?: ProjectContractType;
  status?: ProjectStatus;
  startDate?: Dayjs;
  plannedFinishDate?: Dayjs;
  actualFinishDate?: Dayjs;
  budget?: number;
  currency?: string;
  client?: string;
  responsibleDepartment?: ProjectResponsibleDepartment;
  designProperties?: ProjectDesignProperties;
  designStage?: ProjectDesignStage;
  responsiblePersonId?: string;
  description?: string;
  overallProgressPct?: number;
  isOutsourced?: boolean;
}

function toFormValues(project: Project): ProjectFormValues {
  return {
    projectCode: project.projectCode,
    name: project.name,
    nameZh: project.nameZh ?? undefined,
    location: project.location ?? undefined,
    projectType: project.projectType ?? undefined,
    railwayLengthKm: project.railwayLengthKm ?? undefined,
    urbanRailLengthKm: project.urbanRailLengthKm ?? undefined,
    roadLengthKm: project.roadLengthKm ?? undefined,
    grossFloorAreaM2: project.grossFloorAreaM2 ?? undefined,
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
    client: project.client ?? undefined,
    responsibleDepartment: project.responsibleDepartment,
    designProperties: project.designProperties,
    designStage: project.designStage,
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
    nameZh: values.nameZh?.trim() || undefined,
    location: values.location?.trim() || undefined,
    projectType: values.projectType,
    railwayLengthKm: values.railwayLengthKm,
    urbanRailLengthKm: values.urbanRailLengthKm,
    roadLengthKm: values.roadLengthKm,
    grossFloorAreaM2: values.grossFloorAreaM2,
    contractType: values.contractType,
    status: values.status,
    startDate: values.startDate?.toISOString(),
    plannedFinishDate: values.plannedFinishDate?.toISOString(),
    budget: values.budget,
    currency: values.currency?.trim() || undefined,
    client: values.client?.trim() || undefined,
    responsibleDepartment: values.responsibleDepartment,
    designProperties: values.designProperties,
    designStage: values.designStage,
    responsiblePersonId: values.responsiblePersonId,
    description: values.description?.trim() || undefined,
    overallProgressPct: values.overallProgressPct,
    isOutsourced: values.isOutsourced,
  };
}

function toUpdatePayload(values: ProjectFormValues): UpdateProjectRequest {
  const trimmedClient = values.client?.trim();
  return {
    ...toCreatePayload(values),
    client: trimmedClient ? trimmedClient : null,
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
  const selectedProjectType = Form.useWatch('projectType', form);
  const typeSpecificFields = getFieldsForProjectType(selectedProjectType);
  const isEditing = Boolean(project);
  const isSubmitting = createProject.isPending || updateProject.isPending;

  function resetFormValues(): void {
    if (project) {
      form.setFieldsValue(toFormValues(project));
      return;
    }
    form.resetFields();
    form.setFieldsValue({
      status: PROJECT_STATUS_DEFAULT,
      contractType: PROJECT_CONTRACT_TYPE_DEFAULT,
      responsibleDepartment: PROJECT_RESPONSIBLE_DEPARTMENT_DEFAULT,
      designProperties: PROJECT_DESIGN_PROPERTIES_DEFAULT,
      designStage: PROJECT_DESIGN_STAGE_DEFAULT,
      currency: 'USD',
      overallProgressPct: 0,
      isOutsourced: false,
    });
  }

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
      {...wideDetailDrawerProps}
      open={open}
      title={isEditing ? 'Edit project' : 'New project'}
      onClose={onClose}
      destroyOnHidden
      afterOpenChange={(visible: boolean) => {
        if (!visible) {
          return;
        }
        resetFormValues();
      }}
      extra={null}
      footer={null}
    >
      <Form<ProjectFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
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
          label="Name"
          name="name"
          rules={[{ required: true, message: 'Project name is required' }]}
        >
          <Input placeholder="Project name" />
        </Form.Item>

        <Form.Item label="Chinese Name (optional)" name="nameZh">
          <Input placeholder="项目中文名称" />
        </Form.Item>

        <Form.Item label="Location" name="location">
          <Input placeholder="Site location" />
        </Form.Item>

        <Form.Item label="Project type" name="projectType">
          <Select
            allowClear
            placeholder="Select type"
            options={PROJECT_TYPE_OPTIONS}
          />
        </Form.Item>

        <Form.Item label="Contract type" name="contractType">
          <Select
            allowClear
            placeholder="Select contract type"
            options={PROJECT_CONTRACT_TYPE_OPTIONS}
          />
        </Form.Item>

        {typeSpecificFields.map((field) => (
          <Form.Item
            key={field.key}
            label={`${field.label} (${field.unit})`}
            name={field.key}
          >
            <InputNumber
              className="!w-full"
              min={0}
              placeholder={`Optional - ${field.unit}`}
            />
          </Form.Item>
        ))}

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

        <Divider titlePlacement="left">Project Details</Divider>

        <Form.Item label="Client" name="client">
          <AutoComplete
            allowClear
            options={PROJECT_CLIENT_PRESET_OPTIONS}
            placeholder="Select or enter client name"
            filterOption={(input, option) =>
              (option?.label ?? '')
                .toString()
                .toLowerCase()
                .includes(input.toLowerCase())
            }
          />
        </Form.Item>
        <Form.Item label="Responsible department" name="responsibleDepartment">
          <Select options={PROJECT_RESPONSIBLE_DEPARTMENT_OPTIONS} />
        </Form.Item>
        <Form.Item label="Design properties" name="designProperties">
          <Select options={PROJECT_DESIGN_PROPERTIES_OPTIONS} />
        </Form.Item>
        <Form.Item label="Design stage" name="designStage">
          <Select options={PROJECT_DESIGN_STAGE_OPTIONS} />
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

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={isSubmitting}>
            {isEditing ? 'Save changes' : 'Create project'}
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}
