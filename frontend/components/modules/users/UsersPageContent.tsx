'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dropdown,
  Form,
  Input,
  Modal,
  Pagination,
  Select,
  Space,
  Spin,
  type MenuProps,
} from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import PlaceholderPage from '@/components/PlaceholderPage';
import ThreePeopleIcon from '@/components/ThreePeopleIcon';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { ApiRequestError } from '@/lib/api/errors';
import { useRoles } from '@/lib/query/roles';
import UserImportModal from '@/components/modules/users/UserImportModal';
import {
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

const PAGE_SIZE = 20;

interface InviteFormValues {
  firstName: string;
  lastName: string;
  email: string;
  roleId: string;
}

interface EditFormValues {
  firstName: string;
  lastName: string;
  phone?: string;
  roleId: string;
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
  if (!user.emailVerifiedAt) {
    return 'warning';
  }
  return 'success';
}

function userStatusLabel(user: User): string {
  if (!user.isActive) {
    return 'Inactive';
  }
  if (!user.emailVerifiedAt) {
    return 'Pending activation';
  }
  return 'Active';
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

  useEffect(() => {
    if (!open) {
      return;
    }
    form.setFieldsValue({
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? '',
      isActive: user.isActive,
      roleId: currentRoleId || undefined,
    });
  }, [open, user, currentRoleId, form]);

  async function handleSubmit(values: EditFormValues): Promise<void> {
    setError(null);

    try {
      await updateUser.mutateAsync({
        userId: user.id,
        body: {
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone?.trim() || undefined,
          isActive: values.isActive,
        },
      });

      if (values.roleId !== currentRoleId) {
        if (currentRoleId) {
          await revokeRole.mutateAsync({ userId: user.id, roleId: currentRoleId });
        }
        await assignRole.mutateAsync({ userId: user.id, roleId: values.roleId });
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Failed to update employee.',
      );
    }
  }

  const isSubmitting =
    updateUser.isPending || assignRole.isPending || revokeRole.isPending;

  return (
    <Modal
      open={open}
      title="Update employee"
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Save changes"
      confirmLoading={isSubmitting}
      destroyOnHidden
    >
      <p className="mb-4 text-sm text-slate-500">{user.email}</p>
      <Form<EditFormValues>
        form={form}
        layout="vertical"
        onFinish={(values: EditFormValues) => void handleSubmit(values)}
      >
        <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="First name"
            name="firstName"
            rules={[{ required: true, message: 'First name is required' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Last name"
            name="lastName"
            rules={[{ required: true, message: 'Last name is required' }]}
          >
            <Input />
          </Form.Item>
        </div>
        <Form.Item label="Phone" name="phone">
          <Input type="tel" />
        </Form.Item>
        <Form.Item
          label="Role"
          name="roleId"
          rules={[{ required: true, message: 'Please select a role' }]}
        >
          <Select
            loading={userQuery.isLoading}
            options={roles.map((role) => ({ value: role.id, label: role.name }))}
            placeholder={userQuery.isLoading ? 'Loading role…' : 'Select a role'}
          />
        </Form.Item>
        <Form.Item name="isActive" valuePropName="checked">
          <Checkbox>Active account</Checkbox>
        </Form.Item>
        {error && <Alert type="error" showIcon message={error} className="!mb-0" />}
      </Form>
    </Modal>
  );
}

export default function UsersPageContent(): React.ReactNode {
  const [page, setPage] = useState(1);
  const [form] = Form.useForm<InviteFormValues>();
  const [formError, setFormError] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const usersQuery = useUsers({ page, limit: PAGE_SIZE });
  const rolesQuery = useRoles(
    { page: 1, limit: 100 },
    { enabled: usersQuery.isSuccess },
  );
  const createUser = useCreateUser();
  const assignRole = useAssignRole();
  const deleteUser = useDeleteUser();
  const resendInvitation = useResendInvitation();

  const roles = rolesQuery.data?.data ?? [];
  const employeeRole = roles.find((role) => role.name === 'Employee');

  useEffect(() => {
    if (employeeRole && !form.getFieldValue('roleId')) {
      form.setFieldValue('roleId', employeeRole.id);
    }
  }, [employeeRole, form]);

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
          title="Users"
          description="You do not have permission to manage users."
        />
      );
    }

    return (
      <PlaceholderPage
        icon={ThreePeopleIcon}
        title="Users"
        description="Unable to load users. Please try again later."
      />
    );
  }

  const users = usersQuery.data?.data ?? [];
  const meta = usersQuery.data?.meta;

  async function handleCreateUser(values: InviteFormValues): Promise<void> {
    setFormError(null);
    const invitedAddress = values.email.trim().toLowerCase();

    try {
      const user = await createUser.mutateAsync({
        email: invitedAddress,
        firstName: values.firstName,
        lastName: values.lastName,
        isActive: true,
      });

      await assignRole.mutateAsync({ userId: user.id, roleId: values.roleId });

      form.resetFields();
      if (employeeRole) {
        form.setFieldValue('roleId', employeeRole.id);
      }
      setInvitedEmail(invitedAddress);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFormError(error.message);
      } else {
        setFormError('Failed to create user. Please try again.');
      }
    }
  }

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
            : 'Failed to resend verification email.',
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
        text: `${deletingUser.firstName} ${deletingUser.lastName} has been deactivated.`,
      });
      setDeletingUser(null);
    } catch (error) {
      setActionMessage({
        type: 'error',
        text:
          error instanceof ApiRequestError
            ? error.message
            : 'Failed to delete employee.',
      });
    }
  }

  function buildActionMenu(user: User): MenuProps['items'] {
    const showResend = user.isActive && !user.emailVerifiedAt;
    const items: MenuProps['items'] = [
      {
        key: 'update',
        label: 'Update',
        onClick: () => setEditingUser(user),
      },
    ];

    if (showResend) {
      items.push({
        key: 'resend',
        label: 'Resend verification',
        onClick: () => void handleResendVerification(user),
      });
    }

    items.push({
      key: 'delete',
      label: 'Delete',
      danger: true,
      onClick: () => setDeletingUser(user),
    });

    return items;
  }

  const isSubmitting = createUser.isPending || assignRole.isPending;

  return (
    <div className="space-y-6">
      <Modal
        open={Boolean(invitedEmail)}
        title="Invitation sent"
        onCancel={() => setInvitedEmail(null)}
        onOk={() => setInvitedEmail(null)}
        okText="Done"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <p className="text-sm text-slate-600">
          Invitation sent to <span className="font-medium">{invitedEmail}</span>.
          The employee must verify their email and set a password before they can
          sign in.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          In development, check Mailpit at http://localhost:8025 for the
          activation email.
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
              text: `${editingUser.firstName} ${editingUser.lastName} updated successfully.`,
            })
          }
        />
      )}

      <ConfirmDialog
        open={Boolean(deletingUser)}
        title="Delete employee"
        description={
          deletingUser ? (
            <>
              Deactivate{' '}
              <span className="font-medium">
                {deletingUser.firstName} {deletingUser.lastName}
              </span>{' '}
              ({deletingUser.email})? They will no longer be able to sign in.
            </>
          ) : undefined
        }
        confirmLabel="Delete"
        danger
        confirmLoading={deleteUser.isPending}
        onConfirm={() => void handleDeleteUser()}
        onCancel={() => setDeletingUser(null)}
      />

      {actionMessage && (
        <Alert
          type={actionMessage.type === 'success' ? 'success' : 'error'}
          showIcon
          message={actionMessage.text}
          closable
          onClose={() => setActionMessage(null)}
        />
      )}

      <FormLayout
        title="Invite employee"
        description="An activation email will be sent so they can verify their email and set their password. You never need to choose or share a password."
        extra={
          <Button onClick={() => setImportOpen(true)}>Import from Excel</Button>
        }
      >
        <Form<InviteFormValues>
          form={form}
          layout="vertical"
          onFinish={(values: InviteFormValues) => void handleCreateUser(values)}
          className="max-w-3xl"
        >
          <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
            <Form.Item
              label="First name"
              name="firstName"
              rules={[{ required: true, message: 'First name is required' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="Last name"
              name="lastName"
              rules={[{ required: true, message: 'Last name is required' }]}
            >
              <Input />
            </Form.Item>
          </div>
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Email is required' },
              { type: 'email', message: 'Enter a valid email' },
            ]}
          >
            <Input type="email" />
          </Form.Item>
          <Form.Item
            label="Role"
            name="roleId"
            rules={[{ required: true, message: 'Please select a role' }]}
          >
            <Select
              loading={rolesQuery.isLoading}
              options={roles.map((role) => ({ value: role.id, label: role.name }))}
              placeholder={roles.length === 0 ? 'No roles available' : 'Select a role'}
            />
          </Form.Item>
          {formError && (
            <Alert type="error" showIcon message={formError} className="!mb-4" />
          )}
          <Button
            type="primary"
            htmlType="submit"
            loading={isSubmitting}
            disabled={roles.length === 0}
          >
            {isSubmitting ? 'Sending invitation…' : 'Send invitation'}
          </Button>
        </Form>
      </FormLayout>

      <FormLayout
        title="All users"
        description={`${meta?.total ?? 0} user${meta?.total === 1 ? '' : 's'} total`}
      >
        <DataTable<User>
          rowKey="id"
          dataSource={users}
          locale={{ emptyText: 'No users found.' }}
          columns={[
            {
              title: 'Name',
              key: 'name',
              render: (_, record) => (
                <span className="font-medium text-slate-900">
                  {record.firstName} {record.lastName}
                </span>
              ),
            },
            { title: 'Email', dataIndex: 'email', key: 'email' },
            {
              title: 'Status',
              key: 'status',
              render: (_, record) => (
                <StatusBadge
                  label={userStatusLabel(record)}
                  variant={userStatusVariant(record)}
                />
              ),
            },
            {
              title: 'Roles',
              key: 'roles',
              render: (_, record) => formatUserRoleNames(record),
            },
            {
              title: 'Actions',
              key: 'actions',
              width: 80,
              render: (_, record) => (
                <Dropdown
                  menu={{ items: buildActionMenu(record) }}
                  trigger={['click']}
                  disabled={isSubmitting || resendInvitation.isPending}
                >
                  <Button
                    type="text"
                    icon={<MoreOutlined />}
                    aria-label={`Actions for ${record.firstName} ${record.lastName}`}
                  />
                </Dropdown>
              ),
            },
          ]}
        />

        {meta && meta.pages > 1 && (
          <div className="mt-4 flex justify-center">
            <Pagination
              current={meta.page}
              total={meta.total}
              pageSize={meta.limit}
              showSizeChanger={false}
              onChange={(nextPage: number) => setPage(nextPage)}
            />
          </div>
        )}
      </FormLayout>
    </div>
  );
}
