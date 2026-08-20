'use client';

import { useMemo, useState } from 'react';
import { Alert, Checkbox, Form, Input, Select, Switch } from 'antd';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import {
  buildEmployeeProfilePayload,
  EmployeeProfileFormFields,
  GENDER_OPTIONS,
} from '@/components/modules/users/EmployeeProfileFormFields';
import AddEmployeePendingDocuments, {
  type PendingEmployeeDocument,
} from '@/components/modules/users/add-employee/AddEmployeePendingDocuments';
import AddEmployeeReviewStep from '@/components/modules/users/add-employee/AddEmployeeReviewStep';
import {
  ADD_EMPLOYEE_STEP_FIELDS,
  type AddEmployeeFormValues,
} from '@/components/modules/users/add-employee/add-employee.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import type { CreateUserRequest, Role } from '@/lib/api/types';
import {
  useAssignRole,
  useCreateUser,
  useUploadUserDocuments,
} from '@/lib/query/users';
import {
  useDepartments,
  useEngineeringDisciplineOptions,
  usePositions,
} from '@/lib/query/org';
import { useRoles } from '@/lib/query/roles';

function optionalEmailRule(
  invalidMessage: string,
): { validator: (_: unknown, value: string | undefined) => Promise<void> } {
  return {
    validator: async (_rule, value) => {
      const trimmed = value?.trim() ?? '';
      if (!trimmed) {
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        throw new Error(invalidMessage);
      }
    },
  };
}

export interface AddEmployeeFormProps {
  onSuccess: (result: { userId: string; email: string | null }) => void;
}

export default function AddEmployeeForm({
  onSuccess,
}: AddEmployeeFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<AddEmployeeFormValues>();
  const [error, setError] = useState<string | null>(null);
  const [pendingDocuments, setPendingDocuments] = useState<PendingEmployeeDocument[]>([]);

  const emailValue = Form.useWatch('email', form);
  const departmentIdValue = Form.useWatch('departmentId', form);
  const hasEmail = Boolean(emailValue?.trim());
  const formValues = Form.useWatch([], form) as AddEmployeeFormValues | undefined;

  const createUser = useCreateUser();
  const assignRole = useAssignRole();
  const uploadDocuments = useUploadUserDocuments();
  const rolesQuery = useRoles();
  const roles = rolesQuery.data?.data ?? [];
  const { options: disciplineOptions, isLoading: disciplinesLoading } =
    useEngineeringDisciplineOptions(true, true);
  const departmentsQuery = useDepartments({ page: 1, limit: 100 }, true);
  const positionsQuery = usePositions({ page: 1, limit: 100 }, true);

  const departmentOptions = useMemo(
    () =>
      (departmentsQuery.data?.data ?? []).map((department) => ({
        value: department.id,
        label: department.name,
      })),
    [departmentsQuery.data],
  );

  const allPositions = positionsQuery.data?.data ?? [];
  const positionOptions = useMemo(() => {
    const filtered = departmentIdValue
      ? allPositions.filter((position) => position.departmentId === departmentIdValue)
      : allPositions.filter((position) => position.isActive);
    return filtered.map((position) => ({ value: position.id, label: position.title }));
  }, [allPositions, departmentIdValue]);

  const isSubmitting =
    createUser.isPending || assignRole.isPending || uploadDocuments.isPending;

  function handleDepartmentChange(nextDepartmentId?: string): void {
    const currentPositionId = form.getFieldValue('positionId') as string | undefined;
    if (currentPositionId) {
      const currentPosition = allPositions.find((p) => p.id === currentPositionId);
      if (currentPosition && currentPosition.departmentId !== nextDepartmentId) {
        form.setFieldValue('positionId', undefined);
      }
    }
  }

  async function validateStep(stepIndex: number): Promise<boolean> {
    const fields = ADD_EMPLOYEE_STEP_FIELDS[stepIndex] ?? [];
    if (fields.length === 0) {
      return true;
    }
    try {
      await form.validateFields(fields);
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    let values: AddEmployeeFormValues;
    try {
      values = await form.validateFields();
    } catch {
      messageApi.error(t('users.form.validationFailed'));
      return;
    }

    const invitedAddress = values.email?.trim().toLowerCase() || undefined;
    const body: CreateUserRequest = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      chineseName: values.chineseName?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
      departmentId: values.departmentId,
      positionId: values.positionId,
      engineeringDisciplineId: values.engineeringDisciplineId,
      isActive: values.isActive,
      ...buildEmployeeProfilePayload(values),
    };
    if (invitedAddress) {
      body.email = invitedAddress;
    }

    try {
      const user = await createUser.mutateAsync(body);

      if (values.roleId) {
        await assignRole.mutateAsync({ userId: user.id, roleId: values.roleId });
      }

      if (pendingDocuments.length > 0) {
        await uploadDocuments.mutateAsync({
          userId: user.id,
          files: pendingDocuments.map((item) => item.file),
          labels: pendingDocuments.map(
            (item) => item.label.trim() || item.file.name,
          ),
        });
      }

      onSuccess({ userId: user.id, email: invitedAddress ?? null });
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : t('users.createError'),
      );
    }
  }

  const steps = useMemo(
    () => [
      {
        title: t('users.steps.account'),
        content: (
          <>
            <p className="mb-4 text-sm text-slate-500">
              {hasEmail ? t('users.form.accountInviteHelp') : t('users.form.accountRecordOnlyHelp')}
            </p>
            <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
              <Form.Item
                label={t('users.form.firstName')}
                name="firstName"
                rules={[{ required: true, message: t('common.requiredFirstName') }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                label={t('users.form.lastName')}
                name="lastName"
                rules={[{ required: true, message: t('common.requiredLastName') }]}
              >
                <Input />
              </Form.Item>
            </div>
            <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
              <Form.Item label={t('users.form.middleName')} name="middleName">
                <Input />
              </Form.Item>
              <Form.Item label={t('users.form.gender')} name="gender">
                <Select
                  allowClear
                  placeholder={t('common.select')}
                  options={GENDER_OPTIONS.map((value) => ({
                    value,
                    label: t(`hr.gender.${value}`),
                  }))}
                />
              </Form.Item>
            </div>
            <Form.Item label={t('users.form.chineseName')} name="chineseName">
              <Input placeholder={t('users.form.chineseNamePlaceholder')} />
            </Form.Item>
            <Form.Item
              label={t('users.form.email')}
              name="email"
              normalize={(value: string) => value?.trim() ?? ''}
              rules={[optionalEmailRule(t('common.invalidEmail'))]}
              extra={t('users.form.emailHint')}
            >
              <Input placeholder={t('users.form.emailPlaceholder')} />
            </Form.Item>
            <Form.Item label={t('users.form.phone')} name="phone">
              <Input />
            </Form.Item>
            <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
              <Form.Item label={t('users.form.role')} name="roleId" extra={t('users.form.roleHint')}>
                <Select
                  allowClear
                  loading={rolesQuery.isLoading}
                  options={roles.map((role: Role) => ({
                    value: role.id,
                    label: role.name,
                  }))}
                  placeholder={t('common.selectRole')}
                />
              </Form.Item>
              <Form.Item
                label={t('users.form.activeAccount')}
                name="isActive"
                valuePropName="checked"
              >
                <Switch
                  checkedChildren={t('common.active')}
                  unCheckedChildren={t('common.inactive')}
                />
              </Form.Item>
            </div>
          </>
        ),
        validate: () => validateStep(0),
      },
      {
        title: t('users.steps.personal'),
        content: (
          <EmployeeProfileFormFields
            mode="create"
            sections={['personal', 'address', 'emergency']}
            showSectionTitles={false}
          />
        ),
        validate: () => validateStep(1),
      },
      {
        title: t('users.steps.employment'),
        content: (
          <>
            <EmployeeProfileFormFields
              mode="create"
              sections={['employment']}
              showSectionTitles={false}
            />
            <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
              <Form.Item label={t('users.form.department')} name="departmentId">
                <Select
                  allowClear
                  loading={departmentsQuery.isLoading}
                  placeholder={t('users.filterDepartment')}
                  options={departmentOptions}
                  optionFilterProp="label"
                  onChange={handleDepartmentChange}
                />
              </Form.Item>
              <Form.Item label={t('users.form.position')} name="positionId">
                <Select
                  allowClear
                  loading={positionsQuery.isLoading}
                  placeholder={t('users.filterPosition')}
                  options={positionOptions}
                  optionFilterProp="label"
                />
              </Form.Item>
            </div>
            <Form.Item
              label={t('users.form.discipline')}
              name="engineeringDisciplineId"
              extra={t('users.form.disciplineHint')}
            >
              <Select
                allowClear
                loading={disciplinesLoading}
                placeholder={t('common.selectDiscipline')}
                options={disciplineOptions}
                optionFilterProp="label"
              />
            </Form.Item>
          </>
        ),
        validate: () => validateStep(2),
      },
      {
        title: t('users.steps.education'),
        content: (
          <EmployeeProfileFormFields
            mode="create"
            sections={['education']}
            showSectionTitles={false}
          />
        ),
        validate: () => validateStep(3),
      },
      {
        title: t('users.steps.leaveDocuments'),
        content: (
          <>
            <EmployeeProfileFormFields
              mode="create"
              sections={['leave']}
              showSectionTitles={false}
            />
            <div className="mt-6 border-t border-slate-100 pt-6">
              <div className="mb-3 text-sm font-semibold text-slate-700">
                {t('users.form.profileDocuments')}
              </div>
              <AddEmployeePendingDocuments
                value={pendingDocuments}
                onChange={setPendingDocuments}
              />
            </div>
          </>
        ),
        validate: () => validateStep(4),
      },
      {
        title: t('users.steps.review'),
        content: (
          <AddEmployeeReviewStep
            values={
              formValues ?? {
                firstName: '',
                lastName: '',
                isActive: true,
              }
            }
            roles={roles}
            pendingDocuments={pendingDocuments}
          />
        ),
        validate: () => true,
      },
    ],
    [
      t,
      hasEmail,
      rolesQuery.isLoading,
      roles,
      departmentsQuery.isLoading,
      departmentOptions,
      positionsQuery.isLoading,
      positionOptions,
      disciplinesLoading,
      disciplineOptions,
      pendingDocuments,
      formValues,
      departmentIdValue,
      allPositions,
      form,
    ],
  );

  return (
    <Form<AddEmployeeFormValues>
      form={form}
      layout="vertical"
      initialValues={{ isActive: true }}
    >
      {error ? (
        <Alert type="error" showIcon title={error} className="mb-4" closable onClose={() => setError(null)} />
      ) : null}
      <StepperForm
        steps={steps}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        submitLabel={
          hasEmail ? t('users.sendInvitation') : t('users.createUser')
        }
      />
    </Form>
  );
}
