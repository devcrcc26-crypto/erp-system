'use client';

import { useCallback, useEffect, useState } from 'react';
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
  type MenuProps,
} from 'antd';
import { FilePdfOutlined, MoreOutlined } from '@ant-design/icons';
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
  useUpdateUser,
  useUser,
  useUsers,
} from '@/lib/query/users';
import type { Role, User } from '@/lib/api/types';
import type { UsersExportPdfLabels } from '@/lib/utils/users-export-pdf';
import {
  computeUsersExportSummary,
  exportUsersPdf,
} from '@/lib/utils/users-export-pdf';
import { useAuthStore } from '@/stores/auth.store';

interface InviteFormValues {
  firstName: string;
  lastName: string;
  chineseName?: string;
  email?: string;
  roleId?: string;
}

interface EditFormValues {
  firstName: string;
  lastName: string;
  chineseName?: string;
  phone?: string;
  roleId?: string;
  isActive: boolean;
}

function formatUserRoleNames(user: User): string {
  const roleNames =
    user.userRoles?.map((assignment) => assignment.role.name).join(', ') ?? '';
  return roleNames || '-';
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

function buildUsersExportPdfLabels(
  t: (key: string, vars?: Record<string, string | number>) => string,
): UsersExportPdfLabels {
  return {
    title: t('users.allUsers'),
    subtitle: t('users.exportSubtitle'),
    preparedBy: t('users.preparedBy'),
    generatedAt: t('users.generatedAt'),
    summary: t('users.exportSections.summary'),
    statusBreakdown: t('users.exportSections.statusBreakdown'),
    rolesBreakdown: t('users.exportSections.rolesBreakdown'),
    directory: t('users.exportSections.directory'),
    metric: t('pages.systemReports.table.metric'),
    value: t('pages.systemReports.table.value'),
    status: t('common.status'),
    count: t('pages.systemReports.table.count'),
    share: t('pages.systemReports.table.share'),
    role: t('common.role'),
    name: t('common.name'),
    email: t('common.email'),
    phone: t('users.exportTable.phone'),
    roles: t('common.roles'),
    lastLogin: t('users.exportTable.lastLogin'),
    footer: t('users.pdfFooter'),
    totalUsers: t('users.exportMetrics.totalUsers'),
    activeUsers: t('users.exportMetrics.activeUsers'),
    pendingUsers: t('users.exportMetrics.pendingUsers'),
    inactiveUsers: t('users.exportMetrics.inactiveUsers'),
    noRole: t('users.noRoleAssigned'),
  };
}

function InviteEmployeeModal({
  open,
  onClose,
  roles,
  rolesLoading,
  employeeRoleId,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  roles: Role[];
  rolesLoading: boolean;
  employeeRoleId?: string;
  onInvited: (email: string | null) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const [form] = Form.useForm<InviteFormValues>();
  const [error, setError] = useState<string | null>(null);
  const emailValue = Form.useWatch('email', form);
  const hasEmail = Boolean(emailValue?.trim());
  const createUser = useCreateUser();
  const assignRole = useAssignRole();

  const isSubmitting = createUser.isPending || assignRole.isPending;

  function resetForm(): void {
    form.resetFields();
    if (employeeRoleId) {
      form.setFieldsValue({ roleId: employeeRoleId });
    }
    setError(null);
  }

  async function handleSubmit(values: InviteFormValues): Promise<void> {
    setError(null);
    const invitedAddress = values.email?.trim().toLowerCase() || undefined;

    try {
      const user = await createUser.mutateAsync({
        email: invitedAddress,
        firstName: values.firstName,
        lastName: values.lastName,
        chineseName: values.chineseName?.trim() || undefined,
        isActive: true,
      });

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
      destroyOnHidden
      afterOpenChange={(visible: boolean) => {
        if (visible) {
          resetForm();
        }
      }}
    >
      <p className="mb-4 text-sm text-slate-500">{t('users.inviteHelp')}</p>
      <Form<InviteFormValues>
        form={form}
        layout="vertical"
        initialValues={{ roleId: employeeRoleId }}
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
          rules={[{ type: 'email', message: t('common.invalidEmail') }]}
          extra={t('users.emailOptionalHint')}
        >
          <Input type="email" />
        </Form.Item>
        <Form.Item label={t('common.role')} name="roleId">
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
  const [error, setError] = useState<string | null>(null);

  const currentRoleId =
    userQuery.data?.userRoles[0]?.roleId ??
    userQuery.data?.userRoles[0]?.role?.id ??
    user.userRoles?.[0]?.roleId ??
    user.userRoles?.[0]?.role?.id ??
    '';

  function resetFormValues(): void {
    form.setFieldsValue({
      firstName: user.firstName,
      lastName: user.lastName,
      chineseName: user.chineseName ?? '',
      phone: user.phone ?? '',
      isActive: user.isActive,
      roleId: currentRoleId || undefined,
    });
  }

  useEffect(() => {
    if (!open || !currentRoleId) {
      return;
    }
    form.setFieldValue('roleId', currentRoleId);
  }, [open, currentRoleId, form]);

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
    updateUser.isPending || assignRole.isPending || revokeRole.isPending;

  return (
    <Modal
      open={open}
      title={t('users.updateEmployee')}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={t('common.saveChanges')}
      confirmLoading={isSubmitting}
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
        <Form.Item label={t('common.role')} name="roleId">
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
  const { params, bindMeta } = useTablePagination();
  const [exportingPdf, setExportingPdf] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const usersQuery = useUsers(params);
  const rolesQuery = useRoles(
    { page: 1, limit: 100 },
    { enabled: usersQuery.isSuccess },
  );
  const deleteUser = useDeleteUser();
  const resendInvitation = useResendInvitation();

  const roles = rolesQuery.data?.data ?? [];
  const employeeRole = roles.find((role) => role.name === 'Employee');
  const companyName = authUser?.companyName ?? 'Company';

  const handleExportPdf = useCallback(async (): Promise<void> => {
    setExportingPdf(true);
    try {
      const allUsers = await fetchAllUsers();
      const generatedAt = new Date().toISOString();
      const preparedBy = authUser
        ? `${authUser.firstName} ${authUser.lastName}`.trim() || authUser.email
        : 'User';

      exportUsersPdf({
        companyName,
        generatedAt,
        preparedBy,
        labels: buildUsersExportPdfLabels(t),
        users: allUsers,
        summary: computeUsersExportSummary(allUsers),
        formatUserStatus: (user) => userStatusLabel(user, t),
        formatUserRoles: formatUserRoleNames,
      });
      messageApi.success(t('users.exportSuccess'));
    } catch {
      messageApi.error(t('users.exportError'));
    } finally {
      setExportingPdf(false);
    }
  }, [authUser, companyName, messageApi, t]);

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
        employeeRoleId={employeeRole?.id}
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
              icon={<FilePdfOutlined />}
              loading={exportingPdf}
              onClick={() => void handleExportPdf()}
            >
              {t('users.exportPdf')}
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
        <DataTable<User>
          rowKey="id"
          dataSource={users}
          pagination={bindMeta(meta)}
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
              render: (_, record) => (
                <span className="font-medium text-slate-900">
                  {record.firstName} {record.lastName}
                </span>
              ),
            },
            {
              title: t('common.chineseName'),
              key: 'chineseName',
              ellipsis: { showTitle: true },
              render: (_, record) => record.chineseName || '-',
            },
            {
              title: t('common.email'),
              key: 'email',
              ellipsis: { showTitle: true },
              render: (_, record) => record.email || '-',
            },
            {
              title: t('common.status'),
              key: 'status',
              render: (_, record) => (
                <StatusBadge
                  label={userStatusLabel(record, t)}
                  variant={userStatusVariant(record)}
                />
              ),
            },
            {
              title: t('common.roles'),
              key: 'roles',
              ellipsis: { showTitle: true },
              render: (_, record) => formatUserRoleNames(record),
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
