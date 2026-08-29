'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Form, Input, Select, Skeleton, Switch } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import {
  buildEmployeeProfilePayload,
  EmployeeProfileFormFields,
  employeeProfileInitialValues,
  GENDER_OPTIONS,
} from '@/components/modules/users/EmployeeProfileFormFields';
import EmployeeProfileDocuments from '@/components/modules/users/EmployeeProfileDocuments';
import EmployeeProfilePhoto from '@/components/modules/users/EmployeeProfilePhoto';
import AddEmployeePendingDocuments, {
  type PendingEmployeeDocument,
} from '@/components/modules/users/add-employee/AddEmployeePendingDocuments';
import AddEmployeePendingPhoto from '@/components/modules/users/add-employee/AddEmployeePendingPhoto';
import AddEmployeeReviewStep from '@/components/modules/users/add-employee/AddEmployeeReviewStep';
import {
  ADD_EMPLOYEE_STEP_FIELDS,
  type AddEmployeeFormValues,
} from '@/components/modules/users/add-employee/add-employee.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import type { CreateUserRequest, Role, UpdateUserRequest, UserDetail } from '@/lib/api/types';
import {
  useAssignRole,
  useCreateUser,
  useRevokeRole,
  useUpdateUser,
  useUploadUserDocuments,
  useUploadUserPhoto,
  useUser,
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

function resolvePrimaryRoleId(user: UserDetail): string | undefined {
  return (
    user.userRoles.find((assignment) => assignment.isPrimary)?.roleId ??
    user.userRoles[0]?.roleId ??
    user.userRoles[0]?.role?.id ??
    undefined
  );
}

function buildFormValuesFromUser(user: UserDetail): AddEmployeeFormValues {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    chineseName: user.chineseName ?? '',
    email: user.email ?? '',
    phone: user.phone ?? '',
    departmentId: user.departmentId ?? undefined,
    positionId: user.positionId ?? undefined,
    reportsToUserId: user.reportsToUserId ?? undefined,
    engineeringDisciplineId: user.engineeringDisciplineId ?? undefined,
    isActive: user.isActive,
    roleId: resolvePrimaryRoleId(user),
    ...employeeProfileInitialValues(user),
  };
}

export interface AddEmployeeFormProps {
  userId?: string;
  onSuccess: (result: { userId: string; email: string | null }) => void;
}

export default function AddEmployeeForm({
  userId,
  onSuccess,
}: AddEmployeeFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<AddEmployeeFormValues>();
  const [error, setError] = useState<string | null>(null);
  const [pendingDocuments, setPendingDocuments] = useState<PendingEmployeeDocument[]>([]);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const isEdit = Boolean(userId);

  const emailValue = Form.useWatch('email', form);
  const hasEmail = Boolean(emailValue?.trim());
  const formValues = Form.useWatch([], form) as AddEmployeeFormValues | undefined;

  const userQuery = useUser(userId ?? '', isEdit);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const assignRole = useAssignRole();
  const revokeRole = useRevokeRole();
  const uploadDocuments = useUploadUserDocuments();
  const uploadPhoto = useUploadUserPhoto();
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
  const positionOptions = useMemo(
    () =>
      allPositions
        .filter((position) => position.isActive)
        .map((position) => ({
          value: position.id,
          label: position.titleZh
            ? `${position.title} / ${position.titleZh}`
            : position.title,
        })),
    [allPositions],
  );

  const currentRoleId = userQuery.data ? resolvePrimaryRoleId(userQuery.data) ?? '' : '';

  useEffect(() => {
    if (!isEdit || !userQuery.data) {
      return;
    }
    form.setFieldsValue(buildFormValuesFromUser(userQuery.data));
  }, [isEdit, userQuery.data, form]);

  const isSubmitting =
    createUser.isPending ||
    updateUser.isPending ||
    assignRole.isPending ||
    revokeRole.isPending ||
    uploadDocuments.isPending ||
    uploadPhoto.isPending;

  function resetForm(): void {
    if (isEdit && userQuery.data) {
      form.setFieldsValue(buildFormValuesFromUser(userQuery.data));
    } else {
      form.resetFields();
      form.setFieldsValue({ isActive: true, emergencyContacts: [] });
    }
    setPendingDocuments([]);
    setPendingPhoto(null);
    setError(null);
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

    try {
      if (isEdit && userId) {
        const body: UpdateUserRequest = {
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          chineseName: values.chineseName?.trim() || undefined,
          phone: values.phone?.trim() || undefined,
          departmentId: values.departmentId,
          positionId: values.positionId,
          reportsToUserId: values.reportsToUserId ?? null,
          engineeringDisciplineId: values.engineeringDisciplineId ?? null,
          isActive: values.isActive,
          ...buildEmployeeProfilePayload(values),
        };

        await updateUser.mutateAsync({ userId, body });

        if ((values.roleId ?? '') !== currentRoleId) {
          if (currentRoleId) {
            await revokeRole.mutateAsync({ userId, roleId: currentRoleId });
          }
          if (values.roleId) {
            await assignRole.mutateAsync({ userId, roleId: values.roleId });
          }
        }

        if (pendingDocuments.length > 0) {
          await uploadDocuments.mutateAsync({
            userId,
            files: pendingDocuments.map((item) => item.file),
            labels: pendingDocuments.map(
              (item) => item.label.trim() || item.file.name,
            ),
          });
        }

        if (pendingPhoto) {
          await uploadPhoto.mutateAsync({ userId, file: pendingPhoto });
        }

        onSuccess({
          userId,
          email: userQuery.data?.email ?? values.email?.trim().toLowerCase() ?? null,
        });
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
        reportsToUserId: values.reportsToUserId,
        engineeringDisciplineId: values.engineeringDisciplineId,
        isActive: values.isActive,
        ...buildEmployeeProfilePayload(values),
      };
      if (invitedAddress) {
        body.email = invitedAddress;
      }

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

      if (pendingPhoto) {
        await uploadPhoto.mutateAsync({ userId: user.id, file: pendingPhoto });
      }

      onSuccess({ userId: user.id, email: invitedAddress ?? null });
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : isEdit
            ? t('users.updateError')
            : t('users.createError'),
      );
    }
  }

  const profileMode = isEdit ? 'edit' : 'create';

  const steps = useMemo(
    () => [
      {
        title: t('users.steps.account'),
        content: (
          <>
            <FormLayout
              variant="pro"
              title={t('users.sectionAccountIdentity')}
              description={
                isEdit
                  ? undefined
                  : hasEmail
                    ? t('users.form.accountInviteHelp')
                    : t('users.form.accountRecordOnlyHelp')
              }
            >
              <div className="erp-form-grid-3">
                <Form.Item
                  label={t('users.form.firstName')}
                  name="firstName"
                  rules={[{ required: true, message: t('common.requiredFirstName') }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item label={t('users.form.middleName')} name="middleName">
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
              <div className="erp-form-grid-3">
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
                <Form.Item label={t('users.form.chineseName')} name="chineseName">
                  <Input placeholder={t('users.form.chineseNamePlaceholder')} />
                </Form.Item>
              </div>
            </FormLayout>

            <FormLayout variant="pro" title={t('users.sectionAccountAccess')}>
              <div className="erp-form-grid-3">
                <Form.Item
                  label={t('users.form.email')}
                  name="email"
                  normalize={(value: string) => value?.trim() ?? ''}
                  rules={isEdit ? undefined : [optionalEmailRule(t('common.invalidEmail'))]}
                  extra={
                    isEdit ? t('users.form.emailReadOnlyHint') : t('users.form.emailHint')
                  }
                >
                  <Input
                    placeholder={t('users.form.emailPlaceholder')}
                    disabled={isEdit}
                  />
                </Form.Item>
                <Form.Item label={t('users.form.phone')} name="phone">
                  <Input />
                </Form.Item>
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
              </div>
              <div className="erp-form-grid-3">
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
            </FormLayout>
          </>
        ),
        validate: () => validateStep(0),
      },
      {
        title: t('users.steps.personal'),
        content: (
          <EmployeeProfileFormFields
            mode={profileMode}
            sections={['personal', 'address', 'emergency']}
            layout="sections"
          />
        ),
        validate: () => validateStep(1),
      },
      {
        title: t('users.steps.employment'),
        content: (
          <>
            <EmployeeProfileFormFields
              mode={profileMode}
              sections={['employment']}
              layout="sections"
              employeeIdReadOnly={isEdit}
            />
            <FormLayout variant="pro" title={t('users.sectionOrganizationAssignment')}>
              <div className="erp-form-grid-3">
                <Form.Item label={t('users.form.department')} name="departmentId">
                  <Select
                    allowClear
                    loading={departmentsQuery.isLoading}
                    placeholder={t('users.filterDepartment')}
                    options={departmentOptions}
                    optionFilterProp="label"
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
                <Form.Item
                  label={t('users.form.reportsTo')}
                  name="reportsToUserId"
                  extra={t('users.form.reportsToHint')}
                >
                  <UserSelect
                    placeholder={t('users.form.reportsToPlaceholder')}
                    excludeUserIds={userId ? [userId] : []}
                  />
                </Form.Item>
              </div>
            </FormLayout>
          </>
        ),
        validate: () => validateStep(2),
      },
      {
        title: t('users.steps.education'),
        content: (
          <EmployeeProfileFormFields
            mode={profileMode}
            sections={['education']}
            layout="sections"
          />
        ),
        validate: () => validateStep(3),
      },
      {
        title: t('users.steps.leaveDocuments'),
        content: (
          <>
            <EmployeeProfileFormFields
              mode={profileMode}
              sections={['leave']}
              layout="sections"
            />
            {isEdit && userId ? (
              <>
                <FormLayout variant="pro" title={t('users.profilePhoto')}>
                  <EmployeeProfilePhoto
                    userId={userId}
                    photoDocumentId={userQuery.data?.photoDocumentId}
                    firstName={userQuery.data?.firstName}
                    lastName={userQuery.data?.lastName}
                    canEdit
                    size={88}
                  />
                </FormLayout>
                <FormLayout variant="pro" title={t('users.form.profileDocuments')}>
                  <EmployeeProfileDocuments userId={userId} />
                  <div className="mt-4">
                    <AddEmployeePendingDocuments
                      value={pendingDocuments}
                      onChange={setPendingDocuments}
                    />
                  </div>
                </FormLayout>
              </>
            ) : (
              <>
                <FormLayout variant="pro" title={t('users.profilePhoto')}>
                  <AddEmployeePendingPhoto
                    value={pendingPhoto}
                    onChange={setPendingPhoto}
                  />
                </FormLayout>
                <FormLayout variant="pro" title={t('users.form.profileDocuments')}>
                  <AddEmployeePendingDocuments
                    value={pendingDocuments}
                    onChange={setPendingDocuments}
                  />
                </FormLayout>
              </>
            )}
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
            pendingPhoto={pendingPhoto}
            mode={isEdit ? 'edit' : 'create'}
          />
        ),
        validate: () => true,
      },
    ],
    [
      t,
      hasEmail,
      isEdit,
      userId,
      userQuery.data,
      profileMode,
      rolesQuery.isLoading,
      roles,
      departmentsQuery.isLoading,
      departmentOptions,
      positionsQuery.isLoading,
      positionOptions,
      disciplinesLoading,
      disciplineOptions,
      pendingDocuments,
      pendingPhoto,
      formValues,
      form,
    ],
  );

  if (isEdit && userQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }

  if (isEdit && (userQuery.isError || !userQuery.data)) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          userQuery.error instanceof ApiRequestError
            ? userQuery.error.message
            : t('users.detailNotFound')
        }
      />
    );
  }

  return (
    <Form<AddEmployeeFormValues>
      form={form}
      layout="vertical"
      className="flex min-h-0 flex-1 flex-col"
      initialValues={{ isActive: true, emergencyContacts: [] }}
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          title={error}
          className="mb-4"
          closable
          onClose={() => setError(null)}
        />
      ) : null}
      <StepperForm
        steps={steps}
        onSubmit={handleSubmit}
        onReset={resetForm}
        isSubmitting={isSubmitting}
        contentVariant="sections"
        submitLabel={
          isEdit
            ? t('common.saveChanges')
            : hasEmail
              ? t('users.sendInvitation')
              : t('users.createUser')
        }
      />
    </Form>
  );
}
