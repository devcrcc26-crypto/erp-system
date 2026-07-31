'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dropdown,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  type MenuProps,
} from 'antd';
import type {
  FilterValue,
  SorterResult,
  TablePaginationConfig,
} from 'antd/es/table/interface';
import { FileExcelOutlined, MoreOutlined } from '@ant-design/icons';
import { Users } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import ThreePeopleIcon from '@/components/ThreePeopleIcon';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import { useRoles } from '@/lib/query/roles';
import UserImportModal from '@/components/modules/users/UserImportModal';
import {
  fetchAllUsers,
  useAssignRole,
  useCreateUser,
  useDeleteUser,
  useResendInvitation,
  useRevokeRole,
  useSetPrimaryRole,
  useUpdateUser,
  useUser,
  useUsers,
} from '@/lib/query/users';
import type { CreateUserRequest, Role, User } from '@/lib/api/types';
import {
  useDepartments,
  useEngineeringDisciplineOptions,
  usePositions,
} from '@/lib/query/org';
import { exportUsersExcel } from '@/lib/utils/users-export-excel';
import { pickTopLevelRoleName } from '@/lib/utils/user-display';
import { useAuthStore } from '@/stores/auth.store';
import { tokens } from '@/lib/theme/tokens';

const ROLE_COLOR_MAP: Record<string, string> = {
  'System Administrator': 'red',
  'Project Administrator': 'volcano',
  'Managing Director': 'orange',
  'General Manager': 'gold',
  'Project Director': 'yellow',
  'Project Manager': 'lime',
  'Chief Engineer': 'geekblue',
  'Deputy Chief': 'blue',
  'Department Chief': 'cyan',
  'Discipline Lead': 'purple',
  'Discipline Owner': 'magenta',
  'Institute Chief': 'processing',
  Designer: 'green',
  Reviewer: 'success',
  'Site Coordinator': 'orange',
  'Site Engineer': 'default',
  'Document Controller': 'geekblue',
  Dispatcher: 'warning',
  'Planning Engineer': 'default',
  'Procurement Officer': 'default',
  'Finance Manager': 'default',
  Accountant: 'default',
  'HR Officer': 'default',
  'Safety Officer': 'error',
  'Client Consultant': 'default',
  Storekeeper: 'default',
  Employee: 'default',
};

const COLUMN_SORT_FIELD: Record<string, string> = {
  name: 'firstName',
  email: 'email',
  department: 'departmentId',
  position: 'positionId',
  status: 'isActive',
};

interface InviteFormValues {
  firstName: string;
  lastName: string;
  chineseName?: string;
  email?: string;
  phone?: string;
  departmentId?: string;
  positionId?: string;
  roleId?: string;
  engineeringDisciplineId?: string;
  isActive: boolean;
}

interface EditFormValues {
  firstName: string;
  lastName: string;
  chineseName?: string;
  phone?: string;
  departmentId?: string;
  positionId?: string;
  roleId?: string;
  engineeringDisciplineId?: string;
  isActive: boolean;
}

function formatUserRoleNames(user: User): string {
  const roles =
    user.userRoles?.map((assignment) => ({
      name: assignment.role.name,
      isPrimary: assignment.isPrimary,
    })) ?? [];
  const top = pickTopLevelRoleName(roles, '');
  return top || '-';
}

function userStatusVariant(user: User): 'default' | 'warning' | 'success' {
  if (!user.isActive) {
    return 'default';
  }
  if (!user.email) {
    return 'default';
  }
  if (!user.emailVerifiedAt) {
    return 'warning';
  }
  return 'success';
}

function userStatusLabel(
  user: User,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (!user.isActive) {
    return t('users.statusInactive');
  }
  if (!user.email) {
    return t('users.statusNoLogin');
  }
  if (!user.emailVerifiedAt) {
    return t('users.statusPending');
  }
  return t('users.statusActive');
}

function buildUsersExportLabels(
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  return {
    sheetName: t('users.exportSheetName'),
    name: t('common.name'),
    position: t('common.position'),
    discipline: t('common.discipline'),
    department: t('common.department'),
    role: t('common.role'),
    lastLogin: t('users.exportTable.lastLogin'),
  };
}

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

function InviteEmployeeModal({
  open,
  onClose,
  roles,
  rolesLoading,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  roles: Role[];
  rolesLoading: boolean;
  onInvited: (email: string | null) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const [form] = Form.useForm<InviteFormValues>();
  const [error, setError] = useState<string | null>(null);
  const emailValue = Form.useWatch('email', form);
  const hasEmail = Boolean(emailValue?.trim());
  const departmentIdValue = Form.useWatch('departmentId', form);
  const createUser = useCreateUser();
  const assignRole = useAssignRole();
  const { options: disciplineOptions, isLoading: disciplinesLoading } =
    useEngineeringDisciplineOptions(true, open);
  const departmentsQuery = useDepartments({ page: 1, limit: 100 }, open);
  const positionsQuery = usePositions({ page: 1, limit: 100 }, open);
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

  const isSubmitting = createUser.isPending || assignRole.isPending;

  function resetForm(): void {
    form.resetFields();
    setError(null);
  }

  function handleDepartmentChange(nextDepartmentId?: string): void {
    const currentPositionId = form.getFieldValue('positionId') as string | undefined;
    if (currentPositionId) {
      const currentPosition = allPositions.find((p) => p.id === currentPositionId);
      if (currentPosition && currentPosition.departmentId !== nextDepartmentId) {
        form.setFieldValue('positionId', undefined);
      }
    }
  }

  async function handleSubmit(values: InviteFormValues): Promise<void> {
    setError(null);
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
    };
    if (invitedAddress) {
      body.email = invitedAddress;
    }

    try {
      const user = await createUser.mutateAsync(body);

      if (values.roleId) {
        await assignRole.mutateAsync({ userId: user.id, roleId: values.roleId });
      }

      resetForm();
      onInvited(invitedAddress ?? null);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : t('users.createError'),
      );
    }
  }

  return (
    <Modal
      open={open}
      title={t('users.addEmployee')}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={
        isSubmitting
          ? t('users.savingUser')
          : hasEmail
            ? t('users.sendInvitation')
            : t('users.createUser')
      }
      confirmLoading={isSubmitting}
      className="erp-responsive-modal"
      width={720}
      styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', paddingRight: 4 } }}
      destroyOnHidden
      afterOpenChange={(visible: boolean) => {
        if (visible) {
          resetForm();
        }
      }}
    >
      <p className="mb-4 text-sm text-slate-500">
        {hasEmail ? t('users.inviteHelp') : t('users.recordOnlyHelp')}
      </p>
      <Form<InviteFormValues>
        form={form}
        layout="vertical"
        initialValues={{ isActive: true }}
        onFinish={(values: InviteFormValues) => void handleSubmit(values)}
      >
        <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label={t('common.firstName')}
            name="firstName"
            rules={[{ required: true, message: t('common.requiredFirstName') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t('common.lastName')}
            name="lastName"
            rules={[{ required: true, message: t('common.requiredLastName') }]}
          >
            <Input />
          </Form.Item>
        </div>
        <Form.Item label={t('common.chineseName')} name="chineseName">
          <Input placeholder={t('users.chineseNamePlaceholder')} />
        </Form.Item>
        <Form.Item
          label={t('common.emailOptional')}
          name="email"
          normalize={(value: string) => value?.trim() ?? ''}
          rules={[optionalEmailRule(t('common.invalidEmail'))]}
          extra={t('users.emailOptionalHint')}
        >
          <Input placeholder={t('users.emailOptionalPlaceholder')} />
        </Form.Item>
        <Form.Item label={t('common.phone')} name="phone">
          <Input />
        </Form.Item>
        <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
          <Form.Item label={t('common.department')} name="departmentId">
            <Select
              allowClear
              loading={departmentsQuery.isLoading}
              placeholder={t('users.filterDepartment')}
              options={departmentOptions}
              optionFilterProp="label"
              onChange={handleDepartmentChange}
            />
          </Form.Item>
          <Form.Item label={t('common.position')} name="positionId">
            <Select
              allowClear
              loading={positionsQuery.isLoading}
              placeholder={t('users.filterPosition')}
              options={positionOptions}
              optionFilterProp="label"
            />
          </Form.Item>
        </div>
        <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label={t('common.discipline')}
            name="engineeringDisciplineId"
            extra={t('users.disciplineOptionalHint')}
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
            label={t('users.roleOptional')}
            name="roleId"
            extra={t('users.roleOptionalHint')}
          >
            <Select
              allowClear
              loading={rolesLoading}
              options={roles.map((role) => ({ value: role.id, label: role.name }))}
              placeholder={
                roles.length === 0
                  ? t('common.noRolesAvailable')
                  : t('common.selectRole')
              }
            />
          </Form.Item>
        </div>
        <Form.Item name="isActive" valuePropName="checked">
          <Switch checkedChildren={t('common.active')} unCheckedChildren={t('common.inactive')} />
        </Form.Item>
        {error && <Alert type="error" showIcon title={error} className="!mb-0" />}
      </Form>
    </Modal>
  );
}

function EditEmployeeModal({
  user,
  roles,
  open,
  onClose,
  onSaved,
}: {
  user: User;
  roles: Role[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const [form] = Form.useForm<EditFormValues>();
  const userQuery = useUser(user.id);
  const updateUser = useUpdateUser();
  const assignRole = useAssignRole();
  const revokeRole = useRevokeRole();
  const setPrimaryRole = useSetPrimaryRole();
  const { options: disciplineOptions, isLoading: disciplinesLoading } =
    useEngineeringDisciplineOptions(true, open);
  const departmentIdValue = Form.useWatch('departmentId', form);
  const departmentsQuery = useDepartments({ page: 1, limit: 100 }, open);
  const positionsQuery = usePositions({ page: 1, limit: 100 }, open);
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
  const [error, setError] = useState<string | null>(null);

  const currentRoleId =
    userQuery.data?.userRoles.find((assignment) => assignment.isPrimary)
      ?.roleId ??
    userQuery.data?.userRoles[0]?.roleId ??
    userQuery.data?.userRoles[0]?.role?.id ??
    user.userRoles?.find((assignment) => assignment.isPrimary)?.roleId ??
    user.userRoles?.[0]?.roleId ??
    user.userRoles?.[0]?.role?.id ??
    '';

  const assignedRoles =
    userQuery.data?.userRoles ?? user.userRoles ?? [];

  function resetFormValues(): void {
    const detail = userQuery.data ?? user;
    form.setFieldsValue({
      firstName: detail.firstName,
      lastName: detail.lastName,
      chineseName: detail.chineseName ?? '',
      phone: detail.phone ?? '',
      departmentId: detail.departmentId ?? undefined,
      positionId: detail.positionId ?? undefined,
      engineeringDisciplineId: detail.engineeringDisciplineId ?? undefined,
      isActive: detail.isActive,
      roleId: currentRoleId || undefined,
    });
  }

  function handleDepartmentChange(nextDepartmentId?: string): void {
    const currentPositionId = form.getFieldValue('positionId') as string | undefined;
    if (currentPositionId) {
      const currentPosition = allPositions.find((p) => p.id === currentPositionId);
      if (currentPosition && currentPosition.departmentId !== nextDepartmentId) {
        form.setFieldValue('positionId', undefined);
      }
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    resetFormValues();
  }, [open, userQuery.data, currentRoleId]);

  async function handleSubmit(values: EditFormValues): Promise<void> {
    setError(null);

    try {
      await updateUser.mutateAsync({
        userId: user.id,
        body: {
          firstName: values.firstName,
          lastName: values.lastName,
          chineseName: values.chineseName?.trim() || undefined,
          phone: values.phone?.trim() || undefined,
          departmentId: values.departmentId,
          positionId: values.positionId,
          engineeringDisciplineId: values.engineeringDisciplineId ?? null,
          isActive: values.isActive,
        },
      });

      if ((values.roleId ?? '') !== currentRoleId) {
        if (currentRoleId) {
          await revokeRole.mutateAsync({ userId: user.id, roleId: currentRoleId });
        }
        if (values.roleId) {
          await assignRole.mutateAsync({ userId: user.id, roleId: values.roleId });
        }
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : t('users.updateError'),
      );
    }
  }

  const isSubmitting =
    updateUser.isPending ||
    assignRole.isPending ||
    revokeRole.isPending ||
    setPrimaryRole.isPending;

  async function handleSetPrimary(roleId: string): Promise<void> {
    setError(null);
    try {
      await setPrimaryRole.mutateAsync({ userId: user.id, roleId });
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : t('users.setPrimaryRoleError'),
      );
    }
  }

  return (
    <Modal
      open={open}
      title={t('users.updateEmployee')}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={t('common.saveChanges')}
      confirmLoading={isSubmitting}
      className="erp-responsive-modal"
      width={720}
      styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', paddingRight: 4 } }}
      destroyOnHidden
      afterOpenChange={(visible: boolean) => {
        if (!visible) {
          return;
        }
        resetFormValues();
      }}
    >
      <p className="mb-4 text-sm text-slate-500">
        {user.email ?? t('users.noEmailNoLogin')}
      </p>
      <Form<EditFormValues>
        form={form}
        layout="vertical"
        onFinish={(values: EditFormValues) => void handleSubmit(values)}
      >
        <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label={t('common.firstName')}
            name="firstName"
            rules={[{ required: true, message: t('common.requiredFirstName') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t('common.lastName')}
            name="lastName"
            rules={[{ required: true, message: t('common.requiredLastName') }]}
          >
            <Input />
          </Form.Item>
        </div>
        <Form.Item label={t('common.chineseName')} name="chineseName">
          <Input placeholder={t('users.chineseNamePlaceholder')} />
        </Form.Item>
        <Form.Item label={t('common.phone')} name="phone">
          <Input type="tel" />
        </Form.Item>
        <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
          <Form.Item label={t('common.department')} name="departmentId">
            <Select
              allowClear
              loading={departmentsQuery.isLoading}
              placeholder={t('users.filterDepartment')}
              options={departmentOptions}
              optionFilterProp="label"
              onChange={handleDepartmentChange}
            />
          </Form.Item>
          <Form.Item label={t('common.position')} name="positionId">
            <Select
              allowClear
              loading={positionsQuery.isLoading}
              placeholder={t('users.filterPosition')}
              options={positionOptions}
              optionFilterProp="label"
            />
          </Form.Item>
        </div>
        <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label={t('common.discipline')}
            name="engineeringDisciplineId"
            extra={t('users.disciplineOptionalHint')}
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
            label={t('users.roleOptional')}
            name="roleId"
            extra={t('users.roleOptionalHint')}
          >
            <Select
              allowClear
              loading={userQuery.isLoading}
              options={roles.map((role) => ({ value: role.id, label: role.name }))}
              placeholder={
                userQuery.isLoading
                  ? t('common.loadingRoles')
                  : t('common.selectRole')
              }
            />
          </Form.Item>
        </div>
        {assignedRoles.length > 0 ? (
          <div className="mb-4">
            <div className="mb-2 text-sm font-medium text-slate-700">
              {t('users.assignedRoles')}
            </div>
            <Space orientation="vertical" size={8} style={{ width: '100%' }}>
              {assignedRoles.map((assignment) => {
                const roleId = assignment.roleId ?? assignment.role.id;
                const isPrimary = Boolean(assignment.isPrimary);
                return (
                  <div
                    key={assignment.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2"
                  >
                    <Space size={8}>
                      <span>{assignment.role.name}</span>
                      {isPrimary ? (
                        <Tag color="gold">{t('users.primaryRole')}</Tag>
                      ) : null}
                    </Space>
                    {!isPrimary ? (
                      <Button
                        type="link"
                        size="small"
                        loading={setPrimaryRole.isPending}
                        onClick={() => void handleSetPrimary(roleId)}
                      >
                        {t('users.setAsPrimary')}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </Space>
          </div>
        ) : null}
        <Form.Item name="isActive" valuePropName="checked">
          <Checkbox>{t('common.activeAccount')}</Checkbox>
        </Form.Item>
        {error && <Alert type="error" showIcon title={error} className="!mb-0" />}
      </Form>
    </Modal>
  );
}

export default function UsersPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const authUser = useAuthStore((state) => state.user);
  const { params, bindMeta, resetPage } = useTablePagination();
  const [exportingUsers, setExportingUsers] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState<string | undefined>();
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>();
  const [positionFilter, setPositionFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>();
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search);
      resetPage();
    }, 300);
    return () => clearTimeout(handle);
  }, [search, resetPage]);

  const handleDisciplineFilterChange = useCallback(
    (value?: string) => {
      setDisciplineFilter(value);
      resetPage();
    },
    [resetPage],
  );

  const handleDepartmentFilterChange = useCallback(
    (value?: string) => {
      setDepartmentFilter(value);
      resetPage();
    },
    [resetPage],
  );

  const handlePositionFilterChange = useCallback(
    (value?: string) => {
      setPositionFilter(value);
      resetPage();
    },
    [resetPage],
  );

  const handleStatusFilterChange = useCallback(
    (value?: boolean) => {
      setStatusFilter(value);
      resetPage();
    },
    [resetPage],
  );

  const handleTableChange = useCallback(
    (
      _pagination: TablePaginationConfig,
      _filters: Record<string, FilterValue | null>,
      sorter: SorterResult<User> | SorterResult<User>[],
    ) => {
      const resolved = Array.isArray(sorter) ? sorter[0] : sorter;
      const columnKey =
        typeof resolved?.columnKey === 'string' ? resolved.columnKey : undefined;
      const field = columnKey ? COLUMN_SORT_FIELD[columnKey] : undefined;
      if (!field || !resolved?.order) {
        setSortBy(undefined);
        setSortOrder(undefined);
        return;
      }
      setSortBy(field);
      setSortOrder(resolved.order === 'ascend' ? 'asc' : 'desc');
    },
    [],
  );

  const usersQuery = useUsers({
    ...params,
    search: debouncedSearch || undefined,
    disciplineId: disciplineFilter,
    departmentId: departmentFilter,
    positionId: positionFilter,
    isActive: statusFilter,
    sortBy,
    sortOrder,
  });
  const rolesQuery = useRoles(
    { page: 1, limit: 100 },
    { enabled: usersQuery.isSuccess },
  );
  const deleteUser = useDeleteUser();
  const resendInvitation = useResendInvitation();
  const { options: disciplineFilterOptions, nameById: disciplineNameById } =
    useEngineeringDisciplineOptions(true);
  const departmentsQuery = useDepartments({ page: 1, limit: 100 });
  const positionsQuery = usePositions({ page: 1, limit: 100 });
  const departmentFilterOptions = useMemo(
    () =>
      (departmentsQuery.data?.data ?? []).map((department) => ({
        value: department.id,
        label: department.name,
      })),
    [departmentsQuery.data],
  );
  const positionFilterOptions = useMemo(
    () =>
      (positionsQuery.data?.data ?? []).map((position) => ({
        value: position.id,
        label: position.title,
      })),
    [positionsQuery.data],
  );

  const roles = rolesQuery.data?.data ?? [];
  const companyName = authUser?.companyName ?? 'Company';

  const handleExportExcel = useCallback(async (): Promise<void> => {
    setExportingUsers(true);
    try {
      const allUsers = await fetchAllUsers();
      const generatedAt = new Date().toISOString();

      await exportUsersExcel({
        companyName,
        generatedAt,
        labels: buildUsersExportLabels(t),
        users: allUsers,
        formatUserRoles: formatUserRoleNames,
      });
      messageApi.success(t('users.exportSuccess'));
    } catch {
      messageApi.error(t('users.exportError'));
    } finally {
      setExportingUsers(false);
    }
  }, [companyName, messageApi, t]);

  if (usersQuery.isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  if (usersQuery.isError) {
    const status =
      usersQuery.error instanceof ApiRequestError
        ? usersQuery.error.status
        : 0;

    if (status === 403 || status === 401) {
      return (
        <PlaceholderPage
          icon={ThreePeopleIcon}
          title={t('users.title')}
          description={t('users.noPermission')}
        />
      );
    }

    return (
      <PlaceholderPage
        icon={ThreePeopleIcon}
        title={t('users.title')}
        description={t('users.loadError')}
      />
    );
  }

  const users = usersQuery.data?.data ?? [];
  const meta = usersQuery.data?.meta;

  async function handleResendVerification(user: User): Promise<void> {
    setActionMessage(null);

    try {
      const result = await resendInvitation.mutateAsync(user.id);
      setActionMessage({ type: 'success', text: result.message });
    } catch (error) {
      setActionMessage({
        type: 'error',
        text:
          error instanceof ApiRequestError
            ? error.message
            : t('users.resendError'),
      });
    }
  }

  async function handleDeleteUser(): Promise<void> {
    if (!deletingUser) {
      return;
    }

    try {
      await deleteUser.mutateAsync(deletingUser.id);
      setActionMessage({
        type: 'success',
        text: t('users.deactivated', {
          name: `${deletingUser.firstName} ${deletingUser.lastName}`,
        }),
      });
      setDeletingUser(null);
    } catch (error) {
      setActionMessage({
        type: 'error',
        text:
          error instanceof ApiRequestError
            ? error.message
            : t('users.deleteError'),
      });
    }
  }

  function buildActionMenu(user: User): MenuProps['items'] {
    const showResend = user.isActive && Boolean(user.email) && !user.emailVerifiedAt;
    const items: MenuProps['items'] = [
      {
        key: 'update',
        label: t('common.update'),
        onClick: () => setEditingUser(user),
      },
    ];

    if (showResend) {
      items.push({
        key: 'resend',
        label: t('users.resendVerification'),
        onClick: () => void handleResendVerification(user),
      });
    }

    items.push({
      key: 'delete',
      label: t('common.delete'),
      danger: true,
      onClick: () => setDeletingUser(user),
    });

    return items;
  }

  return (
    <div className="space-y-6">
      <Modal
        open={Boolean(invitedEmail)}
        title={t('users.invitationSent')}
        onCancel={() => setInvitedEmail(null)}
        onOk={() => setInvitedEmail(null)}
        okText={t('common.done')}
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <p className="text-sm text-slate-600">
          {t('users.invitationSentBody', { email: invitedEmail ?? '' })}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          {t('users.invitationDevHint')}
        </p>
      </Modal>

      {importOpen && (
        <UserImportModal
          onClose={() => setImportOpen(false)}
          onImported={(summary) =>
            setActionMessage({ type: 'success', text: summary })
          }
        />
      )}

      <InviteEmployeeModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roles={roles}
        rolesLoading={rolesQuery.isLoading}
        onInvited={(email) => {
          if (email) {
            setInvitedEmail(email);
          } else {
            setActionMessage({
              type: 'success',
              text: t('users.recordOnlyCreated'),
            });
          }
        }}
      />

      {editingUser && (
        <EditEmployeeModal
          key={editingUser.id}
          user={editingUser}
          roles={roles}
          open
          onClose={() => setEditingUser(null)}
          onSaved={() =>
            setActionMessage({
              type: 'success',
              text: t('users.updated', {
                name: `${editingUser.firstName} ${editingUser.lastName}`,
              }),
            })
          }
        />
      )}

      <ConfirmDialog
        open={Boolean(deletingUser)}
        title={t('users.deleteEmployee')}
        description={
          deletingUser
            ? t('users.deleteDescription', {
                name: `${deletingUser.firstName} ${deletingUser.lastName}`,
                email: deletingUser.email ?? t('users.noEmailNoLogin'),
              })
            : undefined
        }
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteUser.isPending}
        onConfirm={() => void handleDeleteUser()}
        onCancel={() => setDeletingUser(null)}
      />

      {actionMessage && (
        <Alert
          type={actionMessage.type === 'success' ? 'success' : 'error'}
          showIcon
          title={actionMessage.text}
          closable
          onClose={() => setActionMessage(null)}
        />
      )}

      <FormLayout
        title={t('users.allUsers')}
        description={
          meta?.total === 1
            ? t('users.userCountOne')
            : t('users.userCount', { count: meta?.total ?? 0 })
        }
        extra={
          <Space wrap>
            <Button
              icon={<FileExcelOutlined />}
              loading={exportingUsers}
              onClick={() => void handleExportExcel()}
            >
              {t('users.exportExcel')}
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              {t('common.importFromExcel')}
            </Button>
            <Button type="primary" onClick={() => setInviteOpen(true)}>
              {t('users.addEmployee')}
            </Button>
          </Space>
        }
      >
        <Input.Search
          placeholder={t('users.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ marginBottom: 12 }}
        />
        <div className="flex flex-wrap gap-2" style={{ marginBottom: 12 }}>
          <Select
            placeholder={t('users.filterDiscipline')}
            options={disciplineFilterOptions}
            allowClear
            style={{ minWidth: 160 }}
            value={disciplineFilter}
            onChange={handleDisciplineFilterChange}
          />
          <Select
            placeholder={t('users.filterDepartment')}
            options={departmentFilterOptions}
            allowClear
            style={{ minWidth: 180 }}
            value={departmentFilter}
            onChange={handleDepartmentFilterChange}
          />
          <Select
            placeholder={t('users.filterPosition')}
            options={positionFilterOptions}
            allowClear
            style={{ minWidth: 180 }}
            value={positionFilter}
            onChange={handlePositionFilterChange}
          />
          <Select
            placeholder={t('users.filterStatus')}
            options={[
              { label: t('common.active'), value: true },
              { label: t('common.inactive'), value: false },
            ]}
            allowClear
            style={{ minWidth: 130 }}
            value={statusFilter}
            onChange={handleStatusFilterChange}
          />
        </div>
        <DataTable<User>
          rowKey="id"
          dataSource={users}
          pagination={bindMeta(meta)}
          onChange={handleTableChange}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Users />}
                title={t('users.noTeamMembers')}
                description={t('users.noTeamMembersDescription')}
                action={{
                  label: t('users.addEmployee'),
                  onClick: () => setInviteOpen(true),
                }}
              />
            ),
          }}
          columns={[
            {
              title: t('common.name'),
              key: 'name',
              sorter: true,
              render: (_, record) => (
                <div className="flex flex-col">
                  <span className="font-medium text-slate-900">
                    {record.firstName} {record.lastName}
                  </span>
                  {record.chineseName ? (
                    <span
                      style={{ color: tokens.colorTextSecondary, fontSize: 12 }}
                    >
                      {record.chineseName}
                    </span>
                  ) : null}
                </div>
              ),
            },
            {
              title: t('common.department'),
              key: 'department',
              ellipsis: { showTitle: true },
              sorter: true,
              render: (_, record) =>
                record.department?.name ?? <span style={{ color: tokens.colorTextSecondary }}>-</span>,
            },
            {
              title: t('common.position'),
              key: 'position',
              ellipsis: { showTitle: true },
              sorter: true,
              render: (_, record) =>
                record.position?.title ?? <span style={{ color: tokens.colorTextSecondary }}>-</span>,
            },
            {
              title: t('common.email'),
              key: 'email',
              ellipsis: { showTitle: true },
              sorter: true,
              render: (_, record) => record.email || '-',
            },
            {
              title: t('common.discipline'),
              key: 'discipline',
              ellipsis: { showTitle: true },
              render: (_, record) => {
                if (!record.engineeringDisciplineId) {
                  return '-';
                }
                const name =
                  record.engineeringDiscipline?.name ??
                  disciplineNameById.get(record.engineeringDisciplineId) ??
                  '-';
                const nameZh = record.engineeringDiscipline?.nameZh;
                return (
                  <div className="flex flex-col">
                    <span>{name}</span>
                    {nameZh ? (
                      <span
                        style={{ color: tokens.colorTextSecondary, fontSize: 12 }}
                      >
                        {nameZh}
                      </span>
                    ) : null}
                  </div>
                );
              },
            },
            {
              title: t('common.role'),
              key: 'roles',
              ellipsis: { showTitle: true },
              render: (_, record) => {
                const roles =
                  record.userRoles?.map((assignment) => ({
                    name: assignment.role.name,
                    isPrimary: assignment.isPrimary,
                  })) ?? [];
                if (roles.length === 0) {
                  return '-';
                }
                const topRole = pickTopLevelRoleName(roles, '');
                if (!topRole) {
                  return '-';
                }
                const isPrimary = roles.some(
                  (role) => role.name === topRole && role.isPrimary,
                );
                return (
                  <Space size={4}>
                    <Tag color={ROLE_COLOR_MAP[topRole] ?? 'default'}>
                      {topRole}
                    </Tag>
                    {isPrimary ? (
                      <Tag color="gold">{t('users.primaryRole')}</Tag>
                    ) : null}
                  </Space>
                );
              },
            },
            {
              title: t('common.status'),
              key: 'status',
              sorter: true,
              render: (_, record) => (
                <StatusBadge
                  label={userStatusLabel(record, t)}
                  variant={userStatusVariant(record)}
                />
              ),
            },
            {
              title: t('common.actions'),
              key: 'actions',
              width: 80,
              render: (_, record) => (
                <Dropdown
                  menu={{ items: buildActionMenu(record) }}
                  trigger={['click']}
                  disabled={resendInvitation.isPending}
                >
                  <Button
                    type="text"
                    icon={<MoreOutlined />}
                    aria-label={t('users.actionsFor', {
                      name: `${record.firstName} ${record.lastName}`,
                    })}
                  />
                </Dropdown>
              ),
            },
          ]}
        />
      </FormLayout>
    </div>
  );
}
