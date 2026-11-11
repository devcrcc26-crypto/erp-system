'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Input, Select, Skeleton, Switch } from 'antd';
import { CheckCircle2, Info } from 'lucide-react';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import {
  buildEmployeeProfilePayload,
  EmployeeProfileFormFields,
  employeeProfileInitialValues,
  GENDER_OPTIONS,
} from '@/components/modules/users/EmployeeProfileFormFields';
import FormFieldGroupLabel from '@/components/modules/users/FormFieldGroupLabel';
import EmployeeProfileDocuments from '@/components/modules/users/EmployeeProfileDocuments';
import EmployeeProfilePhoto from '@/components/modules/users/EmployeeProfilePhoto';
import AddEmployeePendingDocuments, {
  type PendingEmployeeDocument,
} from '@/components/modules/users/add-employee/AddEmployeePendingDocuments';
import AddEmployeePendingPhoto from '@/components/modules/users/add-employee/AddEmployeePendingPhoto';
import AddEmployeeReviewStep from '@/components/modules/users/add-employee/AddEmployeeReviewStep';
import RoleAssignmentField, {
  type RoleAssignment,
} from '@/components/modules/users/add-employee/RoleAssignmentField';
import {
  ADD_EMPLOYEE_STEP_FIELDS,
  type AddEmployeeFormValues,
} from '@/components/modules/users/add-employee/add-employee.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanEditUsers, useIsSystemAdmin } from '@/hooks/use-auth-capabilities';
import { ApiRequestError, toApiRequestError } from '@/lib/api/errors';
import type { CreateUserRequest, UpdateUserRequest, UserDetail } from '@/lib/api/types';
import { SYSTEM_ADMINISTRATOR_ROLE } from '@/lib/constants/protected-accounts';
import {
  chineseNameRules,
  nameFieldRules,
  optionalEmailRule,
  phoneRules,
} from '@/lib/validation/user-fields';
import {
  useAssignRole,
  useCreateUser,
  useRevokeRole,
  useSetPrimaryRole,
  useUpdateUser,
  useUploadUserDocuments,
  useUploadUserPhoto,
  useUser,
} from '@/lib/query/users';
import {
  useDepartments,
  useEngineeringDisciplineOptions,
  usePositions,
  useSeniorityLevels,
} from '@/lib/query/org';
import { useRoles } from '@/lib/query/roles';

function resolveRoleAssignments(user: UserDetail): RoleAssignment[] {
  return (user.userRoles ?? []).map((assignment) => ({
    roleId: assignment.roleId,
    roleName: assignment.role.name,
    isPrimary: Boolean(assignment.isPrimary),
  }));
}

function buildFormValuesFromUser(user: UserDetail): AddEmployeeFormValues {
  const roleAssignments = resolveRoleAssignments(user);
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    chineseName: user.chineseName ?? '',
    email: user.email ?? '',
    phone: user.phone ?? '',
    secondaryPhone: user.secondaryPhone ?? '',
    departmentId: user.departmentId ?? undefined,
    positionId: user.positionId ?? undefined,
    seniorityLevelId: user.seniorityLevelId ?? undefined,
    reportsToUserId: user.reportsToUserId ?? undefined,
    engineeringDisciplineId: user.engineeringDisciplineId ?? undefined,
    isActive: user.isActive,
    loginName: user.loginName ?? '',
    excludedFromHrProcesses: Boolean(user.excludedFromHrProcesses),
    excludedReason: user.excludedReason ?? '',
    roleAssignments,
    roleId: roleAssignments.find((role) => role.isPrimary)?.roleId,
    ...employeeProfileInitialValues(user),
  };
}

/**
 * Syncs desired role assignments onto a user via assign / revoke / set-primary APIs.
 */
async function syncUserRoles(params: {
  userId: string;
  desired: RoleAssignment[];
  current: RoleAssignment[];
  assignRole: ReturnType<typeof useAssignRole>;
  revokeRole: ReturnType<typeof useRevokeRole>;
  setPrimaryRole: ReturnType<typeof useSetPrimaryRole>;
}): Promise<void> {
  const { userId, desired, current, assignRole, revokeRole, setPrimaryRole } =
    params;
  const currentIds = new Set(current.map((role) => role.roleId));
  const desiredIds = new Set(desired.map((role) => role.roleId));

  const ordered = [...desired].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
  );
  for (const role of ordered) {
    if (!currentIds.has(role.roleId)) {
      await assignRole.mutateAsync({
        userId,
        roleId: role.roleId,
        isPrimary: role.isPrimary,
      });
    }
  }

  const primary = desired.find((role) => role.isPrimary) ?? desired[0];
  if (primary) {
    const currentPrimary = current.find((role) => role.isPrimary)?.roleId;
    if (currentPrimary !== primary.roleId || !currentIds.has(primary.roleId)) {
      await setPrimaryRole.mutateAsync({
        userId,
        roleId: primary.roleId,
      });
    }
  }

  for (const role of current) {
    if (!desiredIds.has(role.roleId)) {
      await revokeRole.mutateAsync({ userId, roleId: role.roleId });
    }
  }
}

export interface AddEmployeeFormProps {
  userId?: string;
  /** Leave the form without saving — shown in the stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  onSuccess: (result: {
    userId: string;
    email: string | null;
    /** Shown once when create used issueTemporaryPassword. */
    temporaryPassword?: string;
    /** Shown when name fields changed but loginName was left alone. */
    loginNameUnchangedToast?: string | null;
  }) => void;
}

export default function AddEmployeeForm({
  userId,
  onCancel,
  cancelLabel,
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
  const accountAccessMethod = Form.useWatch('accountAccessMethod', form);
  const formValues = Form.useWatch([], form) as AddEmployeeFormValues | undefined;

  const userQuery = useUser(userId ?? '', isEdit);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const assignRole = useAssignRole();
  const revokeRole = useRevokeRole();
  const setPrimaryRole = useSetPrimaryRole();
  const uploadDocuments = useUploadUserDocuments();
  const uploadPhoto = useUploadUserPhoto();
  const rolesQuery = useRoles();
  const roles = rolesQuery.data?.data ?? [];
  const viewerIsAdmin = useIsSystemAdmin();
  // Login name + approver-only: create/update accept them; users.edit only.
  const canEditUsers = useCanEditUsers();
  const showApproverOnly = canEditUsers;
  const showLoginName = canEditUsers;
  const approverOnlyValue = Form.useWatch('excludedFromHrProcesses', form);
  const firstNameWatch = Form.useWatch('firstName', form);
  const middleNameWatch = Form.useWatch('middleName', form);
  const lastNameWatch = Form.useWatch('lastName', form);
  const suggestedLoginName = [firstNameWatch, middleNameWatch, lastNameWatch]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)
    .join(' ');
  const availableRoles = useMemo(
    () =>
      roles
        .filter((role) => {
          if (role.isActive === false) {
            return false;
          }
          if (
            role.name === SYSTEM_ADMINISTRATOR_ROLE &&
            !viewerIsAdmin
          ) {
            return false;
          }
          return true;
        })
        .map((role) => ({ id: role.id, name: role.name })),
    [roles, viewerIsAdmin],
  );
  const { options: disciplineOptions, isLoading: disciplinesLoading } =
    useEngineeringDisciplineOptions(true, true);
  const departmentsQuery = useDepartments({ page: 1, limit: 100 }, true);
  const positionsQuery = usePositions({ page: 1, limit: 100 }, true);
  const seniorityLevelsQuery = useSeniorityLevels();
  const currentSeniorityLevelId = userQuery.data?.seniorityLevelId ?? null;
  // Active levels, plus the employee's current one even if since deactivated.
  const seniorityOptions = useMemo(
    () =>
      (seniorityLevelsQuery.data ?? [])
        .filter((level) => level.isActive || level.id === currentSeniorityLevelId)
        .map((level) => ({
          value: level.id,
          label: level.nameZh ? `${level.name} / ${level.nameZh}` : level.name,
        })),
    [seniorityLevelsQuery.data, currentSeniorityLevelId],
  );

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

  const currentRoleAssignments = userQuery.data
    ? resolveRoleAssignments(userQuery.data)
    : [];

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
    setPrimaryRole.isPending ||
    uploadDocuments.isPending ||
    uploadPhoto.isPending;

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
          firstName: (values.firstName ?? '').trim(),
          lastName: (values.lastName ?? '').trim(),
          chineseName: values.chineseName?.trim() || undefined,
          phone: values.phone?.trim() || undefined,
          // '' clears the secondary phone.
          secondaryPhone: values.secondaryPhone?.trim() ?? '',
          departmentId: values.departmentId ?? null,
          positionId: values.positionId ?? null,
          seniorityLevelId: values.seniorityLevelId ?? null,
          reportsToUserId: values.reportsToUserId ?? null,
          engineeringDisciplineId: values.engineeringDisciplineId ?? null,
          isActive: values.isActive,
          ...buildEmployeeProfilePayload(values),
          ...(showLoginName && values.loginName?.trim()
            ? { loginName: values.loginName.trim() }
            : {}),
          ...(showApproverOnly
            ? {
                excludedFromHrProcesses: Boolean(values.excludedFromHrProcesses),
                excludedReason: values.excludedFromHrProcesses
                  ? values.excludedReason?.trim() || null
                  : null,
              }
            : {}),
        };

        await updateUser.mutateAsync({ userId, body });

        await syncUserRoles({
          userId,
          desired: values.roleAssignments ?? [],
          current: currentRoleAssignments,
          assignRole,
          revokeRole,
          setPrimaryRole,
        });

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

        const previous = userQuery.data;
        const newFullName = [
          (values.firstName ?? '').trim(),
          (values.middleName ?? '').trim(),
          (values.lastName ?? '').trim(),
        ]
          .filter(Boolean)
          .join(' ');
        const submittedLogin =
          values.loginName?.trim() || previous?.loginName?.trim() || '';
        const previousLogin = previous?.loginName?.trim() ?? '';
        const normalize = (value: string): string =>
          value
            .normalize('NFC')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
        const loginNameUnchangedToast =
          submittedLogin &&
          newFullName &&
          normalize(submittedLogin) === normalize(previousLogin) &&
          normalize(submittedLogin) !== normalize(newFullName)
            ? t('users.loginNameNotChangedToast', { loginName: submittedLogin })
            : null;

        onSuccess({
          userId,
          email: userQuery.data?.email ?? values.email?.trim().toLowerCase() ?? null,
          loginNameUnchangedToast,
        });
        return;
      }

      const invitedAddress = values.email?.trim().toLowerCase() || undefined;
      const issueTemporaryPassword =
        Boolean(invitedAddress) &&
        values.accountAccessMethod === 'temporaryPassword';
      const body: CreateUserRequest = {
        firstName: values.firstName.trim(),
        lastName: (values.lastName ?? '').trim(),
        chineseName: values.chineseName?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        secondaryPhone: values.secondaryPhone?.trim() || undefined,
        departmentId: values.departmentId,
        positionId: values.positionId,
        seniorityLevelId: values.seniorityLevelId,
        reportsToUserId: values.reportsToUserId,
        engineeringDisciplineId: values.engineeringDisciplineId,
        isActive: values.isActive,
        ...buildEmployeeProfilePayload(values),
      };
      if (invitedAddress) {
        body.email = invitedAddress;
      }
      if (issueTemporaryPassword) {
        body.issueTemporaryPassword = true;
      }
      if (showLoginName && values.loginName?.trim()) {
        body.loginName = values.loginName.trim();
      }

      const user = await createUser.mutateAsync(body);

      if (showApproverOnly && values.excludedFromHrProcesses) {
        await updateUser.mutateAsync({
          userId: user.id,
          body: {
            excludedFromHrProcesses: true,
            excludedReason: values.excludedReason?.trim() || null,
          },
        });
      }

      await syncUserRoles({
        userId: user.id,
        desired: values.roleAssignments ?? [],
        current: [],
        assignRole,
        revokeRole,
        setPrimaryRole,
      });

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

      onSuccess({
        userId: user.id,
        email: invitedAddress ?? null,
        temporaryPassword: user.temporaryPassword,
      });
    } catch (err) {
      const apiError = toApiRequestError(err);
      setError(
        apiError.message ||
          (isEdit ? t('users.updateError') : t('users.createError')),
      );
    }
  }

  const profileMode = isEdit ? 'edit' : 'create';

  const steps = useMemo(
    () => [
      {
        title: t('users.steps.account'),
        content: (
          <div className="erp-employee-form-sections">
            <FormLayout variant="pro" title={t('users.sectionNameIdentity')}>
              {/* Row 1: first / middle / last. Row 2: Chinese name (2 columns) + gender,
                  so both rows are full on 3-column screens; one column on phones. */}
              <div className="erp-form-grid-3">
                <Form.Item
                  label={t('users.form.firstName')}
                  name="firstName"
                  rules={nameFieldRules(t, {
                    required: true,
                    requiredMessage: t('common.requiredFirstName'),
                  })}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label={t('users.form.middleName')}
                  name="middleName"
                  rules={nameFieldRules(t, { required: false })}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label={t('users.form.lastName')}
                  name="lastName"
                  rules={nameFieldRules(t, { required: false })}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label={t('users.form.chineseName')}
                  name="chineseName"
                  rules={chineseNameRules(t)}
                  className="md:col-span-2"
                >
                  <Input placeholder={t('users.form.chineseNamePlaceholder')} />
                </Form.Item>
                <Form.Item label={t('users.form.gender')} name="gender">
                  <Select
                    allowClear
                    className="!w-full"
                    placeholder={t('common.select')}
                    options={GENDER_OPTIONS.map((value) => ({
                      value,
                      label: t(`hr.gender.${value}`),
                    }))}
                  />
                </Form.Item>
              </div>
            </FormLayout>

            <FormLayout variant="pro" title={t('users.sectionAccountAccess')}>
              {/* Group 1 - sign-in: email + login name side by side. */}
              <FormFieldGroupLabel>{t('users.form.groupSignIn')}</FormFieldGroupLabel>
              <div className="erp-form-grid-2">
                <Form.Item
                  label={t('users.form.email')}
                  name="email"
                  normalize={(value: string) => value?.trim() ?? ''}
                  rules={isEdit ? undefined : [optionalEmailRule(t('common.invalidEmail'))]}
                  extra={isEdit ? t('users.form.emailReadOnlyHint') : undefined}
                >
                  <Input
                    placeholder={t('users.form.emailPlaceholder')}
                    disabled={isEdit}
                  />
                </Form.Item>
                {showLoginName ? (
                  <Form.Item
                    label={t('users.loginName')}
                    name="loginName"
                    extra={
                      <>
                        <span>
                          {isEdit
                            ? t('users.loginNameEditHint')
                            : t('users.loginNameCreateHint')}
                        </span>
                        {suggestedLoginName ? (
                          <Button
                            type="link"
                            size="small"
                            className="!ml-2 !h-auto !px-0"
                            onClick={() =>
                              form.setFieldsValue({
                                loginName: suggestedLoginName,
                              })
                            }
                          >
                            {t('users.loginNameUseFullName')}
                          </Button>
                        ) : null}
                      </>
                    }
                  >
                    <Input
                      autoComplete="off"
                      placeholder={suggestedLoginName || undefined}
                    />
                  </Form.Item>
                ) : null}
              </div>
              {!isEdit ? (
                /* Live status: changes as the email field is filled or cleared. */
                <div
                  role="status"
                  aria-live="polite"
                  className={`mb-6 flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] leading-snug ${
                    hasEmail
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-slate-50 text-slate-600'
                  }`}
                >
                  {hasEmail ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
                  ) : (
                    <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0">
                    {hasEmail
                      ? t('users.form.accountInviteHelp')
                      : t('users.form.accountRecordOnlyHelp')}
                  </span>
                </div>
              ) : null}

              {/* Group 2 - contact numbers side by side. */}
              <FormFieldGroupLabel divider>{t('users.form.groupContact')}</FormFieldGroupLabel>
              <div className="erp-form-grid-2">
                <Form.Item
                  label={t('users.form.phone')}
                  name="phone"
                  rules={phoneRules(t)}
                  extra={t('users.form.phoneFormatHint')}
                >
                  <Input inputMode="tel" placeholder="+251 9XX XXX XXX" />
                </Form.Item>
                <Form.Item
                  label={t('users.form.secondaryPhone')}
                  name="secondaryPhone"
                  rules={phoneRules(t)}
                >
                  <Input inputMode="tel" placeholder="+251 9XX XXX XXX" />
                </Form.Item>
              </div>

              {/* Group 3 - roles on their own row, then the two status switches. */}
              <FormFieldGroupLabel divider>{t('users.form.groupRolesStatus')}</FormFieldGroupLabel>
              <Form.Item
                label={t('users.form.roles')}
                name="roleAssignments"
                required
                extra={t('users.form.rolesHint')}
                rules={[
                  {
                    validator: async (_, value: RoleAssignment[] | undefined) => {
                      const assignments = value ?? [];
                      if (assignments.length === 0) {
                        throw new Error(t('users.form.rolesRequired'));
                      }
                      const primaryCount = assignments.filter(
                        (assignment) => assignment.isPrimary,
                      ).length;
                      if (primaryCount !== 1) {
                        throw new Error(t('users.form.rolesPrimaryRequired'));
                      }
                      const ids = assignments.map((assignment) => assignment.roleId);
                      if (new Set(ids).size !== ids.length) {
                        throw new Error(t('users.form.rolesDuplicate'));
                      }
                    },
                  },
                ]}
              >
                <RoleAssignmentField
                  availableRoles={availableRoles}
                  loading={rolesQuery.isLoading}
                />
              </Form.Item>
              <div className="erp-form-grid-2">
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
                {showApproverOnly ? (
                  <Form.Item
                    label={t('users.approverOnlySwitch')}
                    name="excludedFromHrProcesses"
                    valuePropName="checked"
                    extra={t('users.approverOnlyHint')}
                  >
                    <Switch />
                  </Form.Item>
                ) : null}
                {showApproverOnly && approverOnlyValue ? (
                  <Form.Item
                    label={t('users.approverOnlyReason')}
                    name="excludedReason"
                    rules={[{ max: 500 }]}
                    className="md:col-span-2"
                  >
                    <Input placeholder={t('users.approverOnlyReasonPlaceholder')} />
                  </Form.Item>
                ) : null}
              </div>
            </FormLayout>
          </div>
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
          <div className="erp-employee-form-sections">
            <EmployeeProfileFormFields
              mode={profileMode}
              sections={['employment', 'payroll']}
              layout="sections"
              employeeIdReadOnly={isEdit}
            />
            <FormLayout variant="pro" title={t('users.sectionOrganizationAssignment')}>
              <div className="erp-form-grid-3">
                <Form.Item label={t('users.form.department')} name="departmentId">
                  <Select
                    allowClear
                    className="!w-full"
                    loading={departmentsQuery.isLoading}
                    placeholder={t('users.filterDepartment')}
                    options={departmentOptions}
                    optionFilterProp="label"
                  />
                </Form.Item>
                <Form.Item label={t('users.form.position')} name="positionId">
                  <Select
                    allowClear
                    className="!w-full"
                    loading={positionsQuery.isLoading}
                    placeholder={t('users.filterPosition')}
                    options={positionOptions}
                    optionFilterProp="label"
                  />
                </Form.Item>
                <Form.Item label={t('users.form.seniority')} name="seniorityLevelId">
                  <Select
                    allowClear
                    className="!w-full"
                    loading={seniorityLevelsQuery.isLoading}
                    placeholder={
                      seniorityOptions.length === 0
                        ? t('users.form.noSeniorityLevelsHint')
                        : t('common.select')
                    }
                    options={seniorityOptions}
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
                    className="!w-full"
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
                  className="md:col-span-2"
                >
                  <UserSelect
                    placeholder={t('users.form.reportsToPlaceholder')}
                    excludeUserIds={userId ? [userId] : []}
                    activeEmploymentOnly
                    approverOnly
                  />
                </Form.Item>
              </div>
            </FormLayout>
          </div>
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
          <div className="erp-employee-form-sections">
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
                <FormLayout
                  variant="pro"
                  title={t('users.form.profileDocuments')}
                  description={t('users.form.documentsHelp')}
                >
                  <EmployeeProfileDocuments userId={userId} embedded />
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
                <FormLayout
                  variant="pro"
                  title={t('users.form.profileDocuments')}
                  description={t('users.form.documentsHelp')}
                >
                  <AddEmployeePendingDocuments
                    value={pendingDocuments}
                    onChange={setPendingDocuments}
                  />
                </FormLayout>
              </>
            )}
          </div>
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
                roleAssignments: [],
              }
            }
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
      showApproverOnly,
      showLoginName,
      suggestedLoginName,
      approverOnlyValue,
      userId,
      userQuery.data,
      profileMode,
      rolesQuery.isLoading,
      availableRoles,
      departmentsQuery.isLoading,
      departmentOptions,
      positionsQuery.isLoading,
      positionOptions,
      seniorityLevelsQuery.isLoading,
      seniorityOptions,
      disciplinesLoading,
      disciplineOptions,
      pendingDocuments,
      pendingPhoto,
      formValues,
      form,
      accountAccessMethod,
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
      className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col"
      initialValues={{
        isActive: true,
        emergencyContacts: [],
        accountAccessMethod: 'invite',
      }}
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
        onCancel={onCancel}
        cancelLabel={cancelLabel}
        isSubmitting={isSubmitting}
        contentVariant="sections"
        submitLabel={
          isEdit
            ? t('common.saveChanges')
            : !hasEmail
              ? t('users.createUser')
              : accountAccessMethod === 'temporaryPassword'
                ? t('users.form.createWithTemporaryPassword')
                : t('users.sendInvitation')
        }
      />
    </Form>
  );
}
