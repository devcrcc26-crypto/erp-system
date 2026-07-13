'use client';

import { useEffect, useState } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Steps } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { DesignPackage } from '@/lib/api/epc.types';
import type {
  ApprovalLevel,
  UrgencyLevel,
} from '@/lib/api/project-management.types';
import type { CreateDesignPackageRequest } from '@/lib/api/epc.types';
import SubtaskRolesFormFields from '@/components/modules/projects/design-packages/SubtaskRolesFormFields';
import {
  type SubtaskRolesFormValues,
  toSubtaskRolesPayload,
} from '@/components/modules/projects/design-packages/subtask-roles-form.util';
import {
  useCreateDesignPackage,
  useUpdateDesignPackage,
} from '@/lib/query/design-packages';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const URGENCY_OPTIONS: Array<{ value: UrgencyLevel; label: string }> = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'VERY_URGENT', label: 'Very urgent' },
];

const REVIEW_LEVEL_OPTIONS: Array<{ value: ApprovalLevel; label: string }> = [
  {
    value: 'DESIGN_INSTITUTE_REVIEW',
    label: 'Design Institute Review',
  },
  {
    value: 'COMPANY_REVIEW',
    label: 'Company Review',
  },
];

interface PackageFormValues {
  name: string;
  nameZh?: string;
  mainWorkContent?: string;
  plannedStartDate?: Dayjs;
  plannedFinishDate?: Dayjs;
  actualWorkDays?: number;
  urgencyLevel?: UrgencyLevel;
  reviewLevel?: ApprovalLevel;
}

type BuilderFormValues = PackageFormValues & SubtaskRolesFormValues;

function toPackagePayload(values: PackageFormValues): CreateDesignPackageRequest {
  return {
    name: values.name.trim(),
    nameZh: values.nameZh?.trim() || undefined,
    mainWorkContent: values.mainWorkContent?.trim() || undefined,
    plannedStartDate: values.plannedStartDate?.format('YYYY-MM-DD'),
    plannedFinishDate: values.plannedFinishDate?.format('YYYY-MM-DD'),
    actualWorkDays: values.actualWorkDays,
    urgencyLevel: values.urgencyLevel,
    reviewLevel: values.reviewLevel,
  };
}

function toPackageFormValues(pkg: DesignPackage): PackageFormValues {
  return {
    name: pkg.name,
    nameZh: pkg.nameZh ?? undefined,
    mainWorkContent: pkg.mainWorkContent ?? undefined,
    plannedStartDate: pkg.plannedStartDate
      ? dayjs(pkg.plannedStartDate)
      : undefined,
    plannedFinishDate: pkg.plannedFinishDate
      ? dayjs(pkg.plannedFinishDate)
      : undefined,
    actualWorkDays: pkg.actualWorkDays ?? undefined,
    urgencyLevel: pkg.urgencyLevel ?? 'NORMAL',
    reviewLevel: pkg.reviewLevel ?? undefined,
  };
}

function defaultRolesFromDiscipline(
  discipline: NonNullable<ReturnType<typeof useProjectDiscipline>['data']>,
): SubtaskRolesFormValues {
  return {
    designerUserId: discipline.designerUserId ?? undefined,
    supportingDesignerUserId: discipline.supportingDesignerUserId ?? undefined,
    disciplineOwnerUserId: discipline.ownerUserId ?? undefined,
    reviewerUserId: discipline.reviewerUserId ?? undefined,
    disciplinaryLeaderUserId: discipline.disciplineLeadUserId ?? undefined,
    deptDeputyChiefUserId: discipline.chiefUserId ?? undefined,
    instituteChiefMode: 'SYSTEM_USER',
    instituteChiefUserId: discipline.instituteChiefUserId ?? undefined,
  };
}

export default function DesignPackageBuilder({
  open,
  projectId,
  taskDisciplineId,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  taskDisciplineId: string;
  editing: DesignPackage | null;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<BuilderFormValues>();
  const [step, setStep] = useState(0);
  const createPackage = useCreateDesignPackage();
  const updatePackage = useUpdateDesignPackage();
  const disciplineQuery = useProjectDiscipline(
    projectId,
    taskDisciplineId,
    open,
  );
  const messageApi = useAppMessage();
  const isSubmitting = createPackage.isPending || updatePackage.isPending;
  const isCreateFlow = !editing;
  const reviewLevel = Form.useWatch('reviewLevel', form);

  useEffect(() => {
    if (!open) {
      setStep(0);
      return;
    }
    if (editing) {
      form.setFieldsValue({
        ...toPackageFormValues(editing),
        instituteChiefMode: editing.instituteChiefName
          ? 'EXTERNAL_PERSON'
          : 'SYSTEM_USER',
      });
      return;
    }
    form.resetFields();
    const defaults = disciplineQuery.data
      ? defaultRolesFromDiscipline(disciplineQuery.data)
      : {};
    form.setFieldsValue({
      urgencyLevel: 'NORMAL',
      instituteChiefMode: 'SYSTEM_USER',
      ...defaults,
    });
  }, [disciplineQuery.data, editing, form, open]);

  async function handleSubmit(values: BuilderFormValues): Promise<void> {
    const body: CreateDesignPackageRequest = {
      ...toPackagePayload(values),
      ...toSubtaskRolesPayload(values),
    };

    try {
      if (editing) {
        await updatePackage.mutateAsync({
          projectId,
          taskDisciplineId,
          packageId: editing.id,
          body,
        });
        messageApi.success('Subtask updated successfully');
      } else {
        await createPackage.mutateAsync({
          projectId,
          taskDisciplineId,
          body,
        });
        messageApi.success('Subtask created successfully');
      }

      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(
        error,
        editing ? 'Failed to update subtask' : 'Failed to create subtask',
        messageApi,
      );
    }
  }

  async function handleNext(): Promise<void> {
    try {
      await form.validateFields([
        'name',
        'plannedStartDate',
        'plannedFinishDate',
        'actualWorkDays',
        'urgencyLevel',
        'reviewLevel',
      ]);
      setStep(1);
    } catch {
      // validation messages shown by ant form
    }
  }

  function renderFooter(): React.ReactNode {
    if (!isCreateFlow) {
      return undefined;
    }
    if (step === 0) {
      return (
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" onClick={() => void handleNext()}>
            Next: assign roles
          </Button>
        </div>
      );
    }
    return (
      <div className="flex justify-end gap-2">
        <Button onClick={() => setStep(0)}>Back</Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          type="primary"
          loading={isSubmitting}
          onClick={() => form.submit()}
        >
          Create subtask
        </Button>
      </div>
    );
  }

  return (
    <Modal
      open={open}
      title={editing ? 'Edit subtask' : 'New subtask'}
      centered
      onCancel={onClose}
      onOk={editing ? () => form.submit() : undefined}
      okText={editing ? 'Save changes' : undefined}
      confirmLoading={isSubmitting}
      destroyOnHidden
      width={720}
      className="erp-responsive-modal"
      styles={{ body: { overflow: 'visible' } }}
      footer={isCreateFlow ? renderFooter() : undefined}
    >
      {isCreateFlow ? (
        <Steps
          size="small"
          current={step}
          className="mb-6"
          items={[
            { title: 'Subtask details' },
            { title: 'Assign roles' },
          ]}
        />
      ) : null}

      <Form<BuilderFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        initialValues={{ urgencyLevel: 'NORMAL', instituteChiefMode: 'SYSTEM_USER' }}
        onFinish={(values: BuilderFormValues) => void handleSubmit(values)}
      >
        {(isCreateFlow ? step === 0 : true) ? (
          <>
            {editing?.subtaskId ? (
              <Form.Item label="Subtask ID">
                <Input readOnly value={editing.subtaskId} className="font-mono" />
              </Form.Item>
            ) : isCreateFlow ? (
              <div className="mb-4 text-sm text-[#6B7280]">
                Subtask number will be assigned automatically when created
              </div>
            ) : null}

            <Form.Item
              label="Subtask name (English)"
              name="name"
              rules={[{ required: true, message: 'Subtask name is required' }]}
            >
              <Input placeholder="e.g. Structural IFC package" />
            </Form.Item>

            <Form.Item label="Subtask name (中文)" name="nameZh">
              <Input placeholder="例如：结构施工图包" />
            </Form.Item>

            <Form.Item label="Main work content" name="mainWorkContent">
              <Input.TextArea rows={3} placeholder="Describe the main scope of work" />
            </Form.Item>

            <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
              <Form.Item label="Planned start" name="plannedStartDate">
                <DatePicker className="w-full" />
              </Form.Item>
              <Form.Item label="Planned finish" name="plannedFinishDate">
                <DatePicker className="w-full" />
              </Form.Item>
            </div>

            <Form.Item label="Actual work days" name="actualWorkDays">
              <InputNumber className="w-full" min={0} placeholder="0" />
            </Form.Item>

            <Form.Item label="Urgency level" name="urgencyLevel">
              <Select allowClear options={URGENCY_OPTIONS} placeholder="Normal" />
            </Form.Item>

            <Form.Item label="Review level" name="reviewLevel">
              <Select
                allowClear
                options={REVIEW_LEVEL_OPTIONS}
                placeholder="Select review level"
              />
            </Form.Item>
          </>
        ) : null}

        {isCreateFlow && step === 1 ? (
          <SubtaskRolesFormFields
            projectId={projectId}
            reviewLevel={reviewLevel}
          />
        ) : null}
      </Form>
    </Modal>
  );
}
