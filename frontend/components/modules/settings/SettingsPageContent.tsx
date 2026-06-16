'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Spin } from 'antd';
import PlaceholderPage from '@/components/PlaceholderPage';
import { Settings } from 'lucide-react';
import { ApiRequestError } from '@/lib/api/errors';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
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
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
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
      <FormLayout
        title="Roles"
        description="Select a role to manage its permissions."
      >
        <DataTable<Role>
          rowKey="id"
          dataSource={roles}
          onRow={(record) => ({
            onClick: () => {
              setSelectedRoleId(record.id);
              setSaveError(null);
              setSaveSuccess(null);
            },
            style: {
              cursor: 'pointer',
              backgroundColor:
                record.id === selectedRoleId ? '#fff7ed' : undefined,
            },
          })}
          columns={[
            { title: 'Name', dataIndex: 'name', key: 'name' },
            {
              title: 'Description',
              key: 'description',
              render: (_, record) => record.description ?? '-',
            },
            {
              title: 'Type',
              key: 'type',
              render: (_, record) => (
                <StatusBadge
                  label={record.isSystemRole ? 'System' : 'Custom'}
                  variant={record.isSystemRole ? 'info' : 'default'}
                />
              ),
            },
            {
              title: 'Status',
              key: 'status',
              render: (_, record) => (
                <StatusBadge
                  label={record.isActive ? 'Active' : 'Inactive'}
                  variant={record.isActive ? 'success' : 'default'}
                />
              ),
            },
          ]}
        />
      </FormLayout>

      {selectedRole && (
        <FormLayout
          title={`Permissions - ${selectedRole.name}`}
          description="Grant module access for this role."
          extra={
            canEditRoles ? (
              <Button
                type="primary"
                onClick={() => void handleSave()}
                loading={updatePermissions.isPending || roleQuery.isLoading}
              >
                Save permissions
              </Button>
            ) : undefined
          }
        >
          {roleQuery.isLoading || permissionsQuery.isLoading ? (
            <Spin />
          ) : (
            <DataTable<{ module: string }>
              rowKey="module"
              dataSource={modules.map((module) => ({ module }))}
              columns={[
                {
                  title: 'Module',
                  dataIndex: 'module',
                  key: 'module',
                  render: (module: string) =>
                    module.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                },
                ...ACTIONS.map((action) => ({
                  title: action.charAt(0).toUpperCase() + action.slice(1),
                  key: action,
                  align: 'center' as const,
                  render: (_: unknown, record: { module: string }) => {
                    const permission = permissionFor(record.module, action);
                    const checked =
                      matrix[matrixKey(record.module, action)] ?? false;

                    if (!permission) {
                      return <span className="text-slate-300">-</span>;
                    }

                    return (
                      <Checkbox
                        checked={checked}
                        disabled={!canEditRoles}
                        onChange={(event: { target: { checked: boolean } }) =>
                          handleToggle(record.module, action, event.target.checked)
                        }
                      />
                    );
                  },
                })),
              ]}
            />
          )}

          {!canEditRoles && (
            <p className="mt-4 text-sm text-slate-500">
              You have view-only access to roles.
            </p>
          )}

          {saveError && (
            <Alert type="error" showIcon message={saveError} className="!mt-4" />
          )}

          {saveSuccess && (
            <Alert type="success" showIcon message={saveSuccess} className="!mt-4" />
          )}
        </FormLayout>
      )}
    </div>
  );
}
