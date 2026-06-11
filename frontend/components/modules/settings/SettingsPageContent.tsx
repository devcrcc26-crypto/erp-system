'use client';

import { useEffect, useMemo, useState } from 'react';
import PlaceholderPage from '@/components/PlaceholderPage';
import { Settings } from 'lucide-react';
import { ApiRequestError } from '@/lib/api/errors';
import {
  usePermissions,
  useRole,
  useRoles,
  useUpdateRolePermissions,
} from '@/lib/query/roles';
import type { Permission, Role, RolePermissionItem } from '@/lib/api/types';
import { useAuthStore } from '@/stores/auth.store';

const ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'approve',
  'export',
] as const;

type PermissionAction = (typeof ACTIONS)[number];

const ACTION_FLAG: Record<PermissionAction, keyof RolePermissionItem> = {
  view: 'canView',
  create: 'canCreate',
  edit: 'canEdit',
  delete: 'canDelete',
  approve: 'canApprove',
  export: 'canExport',
};

function matrixKey(module: string, action: string): string {
  return `${module}:${action}`;
}

function buildMatrixFromRole(
  catalog: Permission[],
  rolePermissions: Array<{
    permissionId: string;
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canApprove: boolean;
    canExport: boolean;
  }>,
): Record<string, boolean> {
  const matrix: Record<string, boolean> = {};

  for (const permission of catalog) {
    const action = permission.action as PermissionAction;
    const flag = ACTION_FLAG[action];
    const assignment = rolePermissions.find(
      (item) => item.permissionId === permission.id,
    );
    const isGranted = assignment?.[flag];
    matrix[matrixKey(permission.module, permission.action)] =
      typeof isGranted === 'boolean' ? isGranted : false;
  }

  return matrix;
}

function buildPermissionsPayload(
  catalog: Permission[],
  matrix: Record<string, boolean>,
): RolePermissionItem[] {
  const items: RolePermissionItem[] = [];

  for (const permission of catalog) {
    const action = permission.action as PermissionAction;
    const flag = ACTION_FLAG[action];
    const checked = matrix[matrixKey(permission.module, permission.action)] ?? false;

    if (!checked) {
      continue;
    }

    items.push({
      permissionId: permission.id,
      canView: flag === 'canView',
      canCreate: flag === 'canCreate',
      canEdit: flag === 'canEdit',
      canDelete: flag === 'canDelete',
      canApprove: flag === 'canApprove',
      canExport: flag === 'canExport',
    });
  }

  return items;
}

export default function SettingsPageContent(): React.ReactNode {
  const canEditRoles = useAuthStore((state) => state.capabilities.canEditRoles);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const rolesQuery = useRoles({ page: 1, limit: 100 });
  const permissionsQuery = usePermissions(Boolean(selectedRoleId));
  const roleQuery = useRole(selectedRoleId ?? '', Boolean(selectedRoleId));
  const updatePermissions = useUpdateRolePermissions();

  const catalog = permissionsQuery.data ?? [];
  const modules = useMemo(
    () => [...new Set(catalog.map((permission) => permission.module))].sort(),
    [catalog],
  );

  useEffect(() => {
    if (!roleQuery.data || catalog.length === 0) {
      return;
    }
    setMatrix(
      buildMatrixFromRole(catalog, roleQuery.data.rolePermissions),
    );
  }, [roleQuery.data, catalog]);

  if (rolesQuery.isLoading) {
    return (
      <div className="rounded-md bg-white p-6 text-sm text-slate-500 shadow-sm">
        Loading settings…
      </div>
    );
  }

  if (rolesQuery.isError) {
    const status =
      rolesQuery.error instanceof ApiRequestError
        ? rolesQuery.error.status
        : 0;

    if (status === 403 || status === 401) {
      return (
        <PlaceholderPage
          icon={Settings}
          title="Settings"
          description="Admin access required to manage roles and permissions."
        />
      );
    }

    return (
      <PlaceholderPage
        icon={Settings}
        title="Settings"
        description="Unable to load roles. Please try again later."
      />
    );
  }

  const roles = rolesQuery.data?.data ?? [];
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;

  function handleToggle(
    module: string,
    action: PermissionAction,
    checked: boolean,
  ): void {
    setSaveSuccess(null);
    setSaveError(null);
    setMatrix((current) => ({
      ...current,
      [matrixKey(module, action)]: checked,
    }));
  }

  async function handleSave(): Promise<void> {
    if (!selectedRoleId) {
      return;
    }

    setSaveError(null);
    setSaveSuccess(null);

    try {
      await updatePermissions.mutateAsync({
        roleId: selectedRoleId,
        permissions: { permissions: buildPermissionsPayload(catalog, matrix) },
      });
      setSaveSuccess('Permissions saved successfully.');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setSaveError(error.message);
      } else {
        setSaveError('Failed to save permissions.');
      }
    }
  }

  function permissionFor(module: string, action: string): Permission | undefined {
    return catalog.find(
      (item) => item.module === module && item.action === action,
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Roles</h2>
        <p className="mt-1 text-sm text-slate-500">
          Select a role to manage its permissions.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Description</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role: Role) => {
                const isSelected = role.id === selectedRoleId;
                return (
                  <tr
                    key={role.id}
                    onClick={() => {
                      setSelectedRoleId(role.id);
                      setSaveError(null);
                      setSaveSuccess(null);
                    }}
                    className={[
                      'cursor-pointer border-b border-slate-100 transition-colors',
                      isSelected ? 'bg-orange-50' : 'hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <td className="px-3 py-3 font-medium text-slate-900">
                      {role.name}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {role.description ?? '-'}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={[
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                          role.isSystemRole
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-600',
                        ].join(' ')}
                      >
                        {role.isSystemRole ? 'System' : 'Custom'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={[
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                          role.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-600',
                        ].join(' ')}
                      >
                        {role.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selectedRole && (
        <section className="rounded-md bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Permissions - {selectedRole.name}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Grant module access for this role.
              </p>
            </div>
            {canEditRoles && (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={updatePermissions.isPending || roleQuery.isLoading}
                className="rounded-md px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: '#f97316' }}
              >
                {updatePermissions.isPending ? 'Saving…' : 'Save permissions'}
              </button>
            )}
          </div>

          {roleQuery.isLoading || permissionsQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading permissions…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-3 font-medium">Module</th>
                    {ACTIONS.map((action) => (
                      <th
                        key={action}
                        className="px-3 py-3 text-center font-medium capitalize"
                      >
                        {action}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modules.map((module) => (
                    <tr key={module} className="border-b border-slate-100">
                      <td className="px-3 py-3 font-medium capitalize text-slate-900">
                        {module.replace(/_/g, ' ')}
                      </td>
                      {ACTIONS.map((action) => {
                        const permission = permissionFor(module, action);
                        const checked =
                          matrix[matrixKey(module, action)] ?? false;

                        return (
                          <td key={action} className="px-3 py-3 text-center">
                            {permission ? (
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!canEditRoles}
                                onChange={(event) =>
                                  handleToggle(
                                    module,
                                    action,
                                    event.target.checked,
                                  )
                                }
                                className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500 disabled:opacity-50"
                              />
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!canEditRoles && (
            <p className="mt-4 text-sm text-slate-500">
              You have view-only access to roles.
            </p>
          )}

          {saveError && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {saveError}
            </p>
          )}

          {saveSuccess && (
            <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              {saveSuccess}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
