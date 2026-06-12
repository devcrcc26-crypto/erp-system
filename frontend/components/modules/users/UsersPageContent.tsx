'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MoreHorizontal } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import ThreePeopleIcon from '@/components/ThreePeopleIcon';
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

const INPUT_CLASS =
  'w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100';

function formatUserRoleNames(user: User): string {
  const roleNames =
    user.userRoles?.map((assignment) => assignment.role.name).join(', ') ?? '';

  return roleNames || '-';
}

function InvitationSuccessModal({
  email,
  onClose,
}: {
  email: string;
  onClose: () => void;
}): React.ReactNode {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invitation-success-title"
        className="relative w-full max-w-md rounded-md bg-white p-6 shadow-lg"
      >
        <h3
          id="invitation-success-title"
          className="text-lg font-semibold text-slate-900"
        >
          Invitation sent
        </h3>
        <p className="mt-3 text-sm text-slate-600">
          Invitation sent to <span className="font-medium">{email}</span>. The
          employee must verify their email and set a password before they can
          sign in.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          In development, check Mailpit at http://localhost:8025 for the
          activation email.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: '#f97316' }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function UserStatusBadge({ user }: { user: User }): React.ReactNode {
  if (!user.isActive) {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
        Inactive
      </span>
    );
  }

  if (!user.emailVerifiedAt) {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        Pending activation
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
      Active
    </span>
  );
}

function UserActionsMenu({
  user,
  isOpen,
  onToggle,
  onClose,
  onUpdate,
  onDelete,
  onResend,
  disabled,
}: {
  user: User;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
  onResend: () => void;
  disabled: boolean;
}): React.ReactNode {
  const menuRef = useRef<HTMLDivElement>(null);
  const showResend = user.isActive && !user.emailVerifiedAt;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent): void {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  return (
    <div ref={menuRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
        aria-label={`Actions for ${user.firstName} ${user.lastName}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <MoreHorizontal size={18} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onUpdate();
            }}
            className="block w-full px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
          >
            Update
          </button>
          {showResend && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                onResend();
              }}
              className="block w-full px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
            >
              Resend verification
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onDelete();
            }}
            className="block w-full px-4 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function EditEmployeeModal({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user: User;
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const userQuery = useUser(user.id);
  const updateUser = useUpdateUser();
  const assignRole = useAssignRole();
  const revokeRole = useRevokeRole();

  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [roleId, setRoleId] = useState('');
  const [isActive, setIsActive] = useState(user.isActive);
  const [error, setError] = useState<string | null>(null);

  const currentRoleId =
    userQuery.data?.userRoles[0]?.roleId ??
    userQuery.data?.userRoles[0]?.role?.id ??
    user.userRoles?.[0]?.roleId ??
    user.userRoles?.[0]?.role?.id ??
    '';

  useEffect(() => {
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setPhone(user.phone ?? '');
    setIsActive(user.isActive);
    setRoleId('');
  }, [user]);

  useEffect(() => {
    if (currentRoleId) {
      setRoleId(currentRoleId);
    }
  }, [user.id, currentRoleId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!roleId) {
      setError('Please select a role.');
      return;
    }

    try {
      await updateUser.mutateAsync({
        userId: user.id,
        body: {
          firstName,
          lastName,
          phone: phone.trim() || undefined,
          isActive,
        },
      });

      if (roleId !== currentRoleId) {
        if (currentRoleId) {
          await revokeRole.mutateAsync({ userId: user.id, roleId: currentRoleId });
        }
        await assignRole.mutateAsync({ userId: user.id, roleId });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-employee-title"
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md bg-white p-6 shadow-lg"
      >
        <h3 id="edit-employee-title" className="text-lg font-semibold text-slate-900">
          Update employee
        </h3>
        <p className="mt-1 text-sm text-slate-500">{user.email}</p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="edit-firstName" className="mb-1 block text-sm font-medium text-slate-700">
                First name
              </label>
              <input
                id="edit-firstName"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="edit-lastName" className="mb-1 block text-sm font-medium text-slate-700">
                Last name
              </label>
              <input
                id="edit-lastName"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-phone" className="mb-1 block text-sm font-medium text-slate-700">
              Phone
            </label>
            <input
              id="edit-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="edit-roleId" className="mb-1 block text-sm font-medium text-slate-700">
              Role
            </label>
            <select
              id="edit-roleId"
              required
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              disabled={userQuery.isLoading || roles.length === 0}
              className={`${INPUT_CLASS} disabled:opacity-60`}
            >
              <option value="" disabled>
                {userQuery.isLoading ? 'Loading role…' : 'Select a role'}
              </option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Active account
          </label>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || userQuery.isLoading}
              className="rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#f97316' }}
            >
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteEmployeeModal({
  user,
  onClose,
  onDeleted,
}: {
  user: User;
  onClose: () => void;
  onDeleted: () => void;
}): React.ReactNode {
  const deleteUser = useDeleteUser();
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(): Promise<void> {
    setError(null);

    try {
      await deleteUser.mutateAsync(user.id);
      onDeleted();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Failed to delete employee.',
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-employee-title"
        className="relative w-full max-w-md rounded-md bg-white p-6 shadow-lg"
      >
        <h3 id="delete-employee-title" className="text-lg font-semibold text-slate-900">
          Delete employee
        </h3>
        <p className="mt-3 text-sm text-slate-600">
          Deactivate{' '}
          <span className="font-medium">
            {user.firstName} {user.lastName}
          </span>{' '}
          ({user.email})? They will no longer be able to sign in.
        </p>

        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleteUser.isPending}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {deleteUser.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPageContent(): React.ReactNode {
  const [page, setPage] = useState(1);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);
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
  const resendInvitation = useResendInvitation();

  const roles = rolesQuery.data?.data ?? [];
  const employeeRole = roles.find((role) => role.name === 'Employee');

  useEffect(() => {
    if (!roleId && employeeRole) {
      setRoleId(employeeRole.id);
    }
  }, [employeeRole, roleId]);

  if (usersQuery.isLoading) {
    return (
      <div className="rounded-md bg-white p-6 text-sm text-slate-500 shadow-sm">
        Loading users…
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

  async function handleCreateUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    if (!roleId) {
      setFormError('Please select a role.');
      return;
    }

    const invitedAddress = email.trim().toLowerCase();

    try {
      const user = await createUser.mutateAsync({
        email: invitedAddress,
        firstName,
        lastName,
        isActive: true,
      });

      await assignRole.mutateAsync({ userId: user.id, roleId });

      setEmail('');
      setFirstName('');
      setLastName('');
      setRoleId(employeeRole?.id ?? '');
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

  const isSubmitting = createUser.isPending || assignRole.isPending;

  return (
    <div className="space-y-6">
      {invitedEmail && (
        <InvitationSuccessModal
          email={invitedEmail}
          onClose={() => setInvitedEmail(null)}
        />
      )}

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
          onClose={() => setEditingUser(null)}
          onSaved={() =>
            setActionMessage({
              type: 'success',
              text: `${editingUser.firstName} ${editingUser.lastName} updated successfully.`,
            })
          }
        />
      )}

      {deletingUser && (
        <DeleteEmployeeModal
          user={deletingUser}
          onClose={() => setDeletingUser(null)}
          onDeleted={() =>
            setActionMessage({
              type: 'success',
              text: `${deletingUser.firstName} ${deletingUser.lastName} has been deactivated.`,
            })
          }
        />
      )}

      {actionMessage && (
        <div
          className={[
            'rounded-md px-4 py-3 text-sm',
            actionMessage.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-600',
          ].join(' ')}
        >
          {actionMessage.text}
        </div>
      )}

      <section className="rounded-md bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Invite employee</h2>
            <p className="mt-1 text-sm text-slate-500">
              An activation email will be sent so they can verify their email and
              set their password. You never need to choose or share a password.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Import from Excel
          </button>
        </div>

        <form onSubmit={handleCreateUser} className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="firstName" className="mb-1 block text-sm font-medium text-slate-700">
              First name
            </label>
            <input
              id="firstName"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="lastName" className="mb-1 block text-sm font-medium text-slate-700">
              Last name
            </label>
            <input
              id="lastName"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="roleId" className="mb-1 block text-sm font-medium text-slate-700">
              Role
            </label>
            <select
              id="roleId"
              required
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              disabled={rolesQuery.isLoading}
              className={`${INPUT_CLASS} disabled:opacity-60`}
            >
              {roles.length === 0 && (
                <option value="">No roles available</option>
              )}
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          {formError && (
            <p className="md:col-span-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {formError}
            </p>
          )}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isSubmitting || roles.length === 0}
              className="rounded-md px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#f97316' }}
            >
              {isSubmitting ? 'Sending invitation…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-md bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">All users</h2>
            <p className="text-sm text-slate-500">
              {meta?.total ?? 0} user{meta?.total === 1 ? '' : 's'} total
            </p>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-visible">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Email</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Roles</th>
                <th className="px-3 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: User) => (
                <tr key={user.id} className="border-b border-slate-100">
                  <td className="px-3 py-3 font-medium text-slate-900">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{user.email}</td>
                  <td className="px-3 py-3">
                    <UserStatusBadge user={user} />
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {formatUserRoleNames(user)}
                  </td>
                  <td className="px-3 py-3">
                    <UserActionsMenu
                      user={user}
                      isOpen={openMenuUserId === user.id}
                      onToggle={() =>
                        setOpenMenuUserId((current) =>
                          current === user.id ? null : user.id,
                        )
                      }
                      onClose={() => setOpenMenuUserId(null)}
                      onUpdate={() => setEditingUser(user)}
                      onDelete={() => setDeletingUser(user)}
                      onResend={() => void handleResendVerification(user)}
                      disabled={isSubmitting || resendInvitation.isPending}
                    />
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {meta && meta.pages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {meta.page} of {meta.pages}
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.min(meta.pages, current + 1))
              }
              disabled={page >= meta.pages}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
