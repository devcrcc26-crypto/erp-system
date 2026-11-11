'use client';

import { useEffect, useState } from 'react';
import { Button, DatePicker, Drawer, Form, Input, InputNumber, Select, Steps } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { DesignPackage } from '@/lib/api/epc.types';
import type {
  ApprovalLevel,
  UrgencyLevel,
} from '@/lib/api/project-management.types';
import type { CreateDesignPackageRequest } from '@/lib/api/epc.types';
import SubtaskExternalPartiesFormFields from '@/components/modules/projects/design-packages/SubtaskExternalPartiesFormFields';
import SubtaskRolesFormFields from '@/components/modules/projects/design-packages/SubtaskRolesFormFields';
import {
  type SubtaskRolesFormValues,
  defaultSubtaskRolesFromDiscipline,
  toSubtaskRolesFormValues,
  toSubtaskRolesPayload,
} from '@/components/modules/projects/design-packages/subtask-roles-form.util';
import {
  useCreateDesignPackage,
  useUpdateDesignPackage,
} from '@/lib/query/design-packages';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import { useAuthStore } from '@/stores/auth.store';
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
  currentUserId?: string,
): SubtaskRolesFormValues {
  return defaultSubtaskRolesFromDiscipline(discipline, currentUserId);
}

export default function DesignPackageBuilder({
  open,
  projectId,
  taskDisciplineId,
  editing,
  disciplineChoices,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  taskDisciplineId: string;
  editing: DesignPackage | null;
  /** When creating a subtask under multiple disciplines, pick on step 1. */
  disciplineChoices?: Array<{ value: string; label: string }>;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<BuilderFormValues>();
  const [step, setStep] = useState(0);
  const [selectedDisciplineId, setSelectedDisciplineId] = useState<
    string | undefined
  >(undefined);
  const createPackage = useCreateDesignPackage();
  const updatePackage = useUpdateDesignPackage();
  const isEditing = Boolean(editing);
  const requiresDisciplinePick =
    !isEditing && (disciplineChoices?.length ?? 0) > 1;
  const effectiveDisciplineId = isEditing
    ? taskDisciplineId
    : requiresDisciplinePick
      ? (selectedDisciplineId ?? '')
      : taskDisciplineId || disciplineChoices?.[0]?.value || '';
  const disciplineQuery = useProjectDiscipline(
    projectId,
    effectiveDisciplineId,
    open && Boolean(effectiveDisciplineId),
  );
  const currentUserId = useAuthStore((state) => state.user?.id);
  const messageApi = useAppMessage();
  const isSubmitting = createPackage.isPending || updatePackage.isPending;
  const reviewLevel = Form.useWatch('reviewLevel', form);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setSelectedDisciplineId(undefined);
      return;
    }
    if (editing) {
      form.setFieldsValue({
        ...toPackageFormValues(editing),
        ...toSubtaskRolesFormValues(editing),
      });
      return;
    }
    form.resetFields();
    const initialDisciplineId =
      disciplineChoices?.length === 1
        ? disciplineChoices[0].value
        : taskDisciplineId || undefined;
    setSelectedDisciplineId(initialDisciplineId);
    form.setFieldsValue({
      urgencyLevel: 'NORMAL',
      instituteChiefMode: 'SYSTEM_USER',
    });
  }, [disciplineChoices, editing, form, open, taskDisciplineId]);

  useEffect(() => {
    if (!open || isEditing || !disciplineQuery.data) {
      return;
    }
    const defaults = defaultRolesFromDiscipline(disciplineQuery.data, currentUserId);
    const current = form.getFieldsValue(true) as BuilderFormValues;
    form.setFieldsValue({
      ...current,
      ...defaults,
      urgencyLevel: current.urgencyLevel ?? 'NORMAL',
      instituteChiefMode: current.instituteChiefMode ?? 'SYSTEM_USER',
    });
  }, [currentUserId, disciplineQuery.data, form, isEditing, open]);

  async function handleSubmit(): Promise<void> {
    const mergedValues = form.getFieldsValue(true) as BuilderFormValues;
    const showInstituteChief =
      mergedValues.reviewLevel == null ||
      mergedValues.reviewLevel === 'COMPANY_REVIEW';
    if (
      showInstituteChief &&
      mergedValues.instituteChiefMode === 'EXTERNAL_PERSON' &&
      !mergedValues.instituteChiefName?.trim()
    ) {
      messageApi.error("External person's name is required");
      setStep(1);
      return;
    }

    const body: CreateDesignPackageRequest = {
      ...toPackagePayload(mergedValues),
      ...toSubtaskRolesPayload(mergedValues),
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
        if (!effectiveDisciplineId) {
          messageApi.error('Select a discipline for this subtask');
          return;
        }
        await createPackage.mutateAsync({
          projectId,
          taskDisciplineId: effectiveDisciplineId,
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

  async function handleNextFromDetails(): Promise<void> {
    if (requiresDisciplinePick && !selectedDisciplineId) {
      messageApi.error('Select a discipline for this subtask');
      return;
    }

    try {
      await form.validateFields([
        'name',
        'plannedStartDate',
        'plannedFinishDate',
        'actualWorkDays',
        'urgencyLevel',
        'reviewLevel',
      ]);
      if (!isEditing && disciplineQuery.data) {
        const defaults = defaultRolesFromDiscipline(
          disciplineQuery.data,
          currentUserId,
        );
        const current = form.getFieldsValue(true) as BuilderFormValues;
        form.setFieldsValue({
          ...current,
          ...defaults,
        });
      }
      setStep(1);
    } catch {
      // validation messages shown by ant form
    }
  }

  function handleNextFromRoles(): void {
    setStep(2);
  }

  function renderFooter(): React.ReactNode {
    if (step === 0) {
      return (
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" onClick={() => void handleNextFromDetails()}>
            Next: assign roles
          </Button>
        </div>
      );
    }

    if (step === 1) {
      return (
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => setStep(0)}>Back</Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" onClick={handleNextFromRoles}>
            Next: external parties
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={() => setStep(1)}>Back</Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          type="primary"
          loading={isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {isEditing ? 'Save changes' : 'Create subtask'}
        </Button>
      </div>
    );
  }

  return (
    <Drawer
      open={open}
      title={isEditing ? 'Edit subtask' : 'New subtask'}
      onClose={onClose}
      size={560}
      placement="right"
      className="erp-responsive-drawer"
      footer={renderFooter()}
      styles={{
        body: {
          overflowY: 'auto',
          paddingBottom: 80,
        },
      }}
    >
      <Steps
        size="small"
        current={step}
        className="mb-6"
        items={[
          { title: 'Subtask details' },
          { title: 'Assign roles' },
          { title: 'External parties' },
        ]}
      />

      <Form<BuilderFormValues>
        form={form}
        layout="vertical"
        preserve
        className="erp-drawer-form"
        initialValues={{ urgencyLevel: 'NORMAL', instituteChiefMode: 'SYSTEM_USER' }}
      >
        {step === 0 ? (
          <>
            {requiresDisciplinePick ? (
              <Form.Item label="Discipline" required>
                <Select
                  showSearch
                  placeholder="Select discipline"
                  value={selectedDisciplineId}
                  onChange={setSelectedDisciplineId}
                  options={disciplineChoices}
                  optionFilterProp="label"
                />
              </Form.Item>
            ) : null}

            {editing?.subtaskId ? (
              <Form.Item label="Subtask ID">
                <Input readOnly value={editing.subtaskId} className="font-mono" />
              </Form.Item>
            ) : !isEditing ? (
              <div className="mb-4 text-sm text-[#6B7280]">
                Subtask number will be assigned automatically when created
              </div>
            ) : null}

            <Form.Item
              label="Subtask name (English)"
              name="name"
              rules={[{ required: true, message: 'Subtask name is required' }]}
            >
              <Input placeholder="e.g. Structural IFC subtask" />
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

        {step === 1 ? (
          <SubtaskRolesFormFields
            projectId={projectId}
            reviewLevel={reviewLevel}
            includeExternalParties={false}
          />
        ) : null}

        {step === 2 ? (
          <SubtaskExternalPartiesFormFields
            projectId={projectId}
            initialSiteRepType={
              editing
                ? (toSubtaskRolesFormValues(editing).siteRepType ?? 'EXTERNAL')
                : 'EXTERNAL'
            }
          />
        ) : null}
      </Form>
    </Drawer>
  );
}
