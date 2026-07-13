'use client';

import { DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { DesignPackage } from '@/lib/api/epc.types';
import type {
  ApprovalLevel,
  UrgencyLevel,
} from '@/lib/api/project-management.types';
import type { CreateDesignPackageRequest } from '@/lib/api/epc.types';
import {
  useCreateDesignPackage,
  useUpdateDesignPackage,
} from '@/lib/query/design-packages';
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
  const [form] = Form.useForm<PackageFormValues>();
  const createPackage = useCreateDesignPackage();
  const updatePackage = useUpdateDesignPackage();
  const messageApi = useAppMessage();
  const isSubmitting = createPackage.isPending || updatePackage.isPending;

  async function handleSubmit(values: PackageFormValues): Promise<void> {
    const body = toPackagePayload(values);

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

  return (
    <Modal
      open={open}
      title={editing ? 'Edit subtask' : 'New subtask'}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={editing ? 'Save changes' : 'Create package'}
      confirmLoading={isSubmitting}
      destroyOnHidden
      width={720}
      className="erp-responsive-drawer"
      afterOpenChange={(visible: boolean) => {
        if (!visible) {
          return;
        }
        if (editing) {
          form.setFieldsValue(toPackageFormValues(editing));
          return;
        }
        form.resetFields();
        form.setFieldsValue({ urgencyLevel: 'NORMAL' });
      }}
    >
      <Form<PackageFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        initialValues={{ urgencyLevel: 'NORMAL' }}
        onFinish={(values: PackageFormValues) => void handleSubmit(values)}
      >
        {editing?.subtaskId ? (
          <Form.Item label="Subtask ID">
            <Input
              readOnly
              value={editing.subtaskId}
              className="font-mono"
            />
          </Form.Item>
        ) : (
          <div className="mb-4 text-sm text-[#6B7280]">
            Subtask ID will be assigned automatically
          </div>
        )}

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
          <Select
            allowClear
            options={URGENCY_OPTIONS}
            placeholder="Normal"
          />
        </Form.Item>

        <Form.Item label="Review level" name="reviewLevel">
          <Select
            allowClear
            options={REVIEW_LEVEL_OPTIONS}
            placeholder="Select review level"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
