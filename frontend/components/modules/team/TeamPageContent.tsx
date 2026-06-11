'use client';

import { useEffect, useState, type FormEvent } from 'react';
import PlaceholderPage from '@/components/PlaceholderPage';
import ThreePeopleIcon from '@/components/ThreePeopleIcon';
import { ApiRequestError } from '@/lib/api/errors';
import { useRoles } from '@/lib/query/roles';
import {
  useAssignRole,
  useCreateUser,
  useUser,
  useUsers,
} from '@/lib/query/users';
import type { User } from '@/lib/api/types';

const PAGE_SIZE = 20;

function UserRolesCell({ userId }: { userId: string }): React.ReactNode {
  const { data, isLoading } = useUser(userId);

  if (isLoading) {
    return <span className="text-slate-400">…</span>;
  }

  const roleNames =
    data?.userRoles?.map((assignment) => assignment.role.name).join(', ') ?? '-';

  return <span>{roleNames || '-'}</span>;
}

export default function TeamPageContent(): React.ReactNode {
  const [page, setPage] = useState(1);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const usersQuery = useUsers({ page, limit: PAGE_SIZE });
  const rolesQuery = useRoles(
    { page: 1, limit: 100 },
    { enabled: usersQuery.isSuccess },
  );
  const createUser = useCreateUser();
  const assignRole = useAssignRole();

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
        Loading team…
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
          title="Team"
          description="You do not have permission to manage users."
        />
      );
    }

    return (
      <PlaceholderPage
        icon={ThreePeopleIcon}
        title="Team"
        description="Unable to load users. Please try again later."
      />
    );
  }

  const users = usersQuery.data?.data ?? [];
  const meta = usersQuery.data?.meta;

  async function handleCreateUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (!roleId) {
      setFormError('Please select a role.');
      return;
    }

    try {
      const user = await createUser.mutateAsync({
        email,
        firstName,
        lastName,
        password,
        isActive: true,
      });

      await assignRole.mutateAsync({ userId: user.id, roleId });

      setEmail('');
      setFirstName('');
      setLastName('');
      setPassword('');
      setRoleId(employeeRole?.id ?? '');
      setSuccessMessage(
        `Account created for ${user.firstName} ${user.lastName}.`,
      );
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFormError(error.message);
      } else {
        setFormError('Failed to create user. Please try again.');
      }
    }
  }

  const isSubmitting = createUser.isPending || assignRole.isPending;

  return (
    <div className="space-y-6">
      <section className="rounded-md bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Create employee account</h2>
        <p className="mt-1 text-sm text-slate-500">
          Add a new user and assign their role.
        </p>

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
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100"
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
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100"
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
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100 disabled:opacity-60"
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

          {successMessage && (
            <p className="md:col-span-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              {successMessage}
            </p>
          )}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isSubmitting || roles.length === 0}
              className="rounded-md px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#f97316' }}
            >
              {isSubmitting ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-md bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Team members</h2>
            <p className="text-sm text-slate-500">
              {meta?.total ?? 0} user{meta?.total === 1 ? '' : 's'} total
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Email</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Roles</th>
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
                    <span
                      className={[
                        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                        user.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600',
                      ].join(' ')}
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    <UserRolesCell userId={user.id} />
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
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
