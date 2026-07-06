'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Spin, Tabs } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import PlaceholderPage from '@/components/PlaceholderPage';
import { Settings } from 'lucide-react';
import { ApiRequestError } from '@/lib/api/errors';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  usePermissions,
  useRole,
  useRoles,
  useUpdateRolePermissions,
} from '@/lib/query/roles';
import type { Permission, Role, RolePermissionItem } from '@/lib/api/types';
import { useAuthStore } from '@/stores/auth.store';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import SettingsDepartmentsPanel from '@/components/modules/settings/SettingsDepartmentsPanel';
import SettingsDisciplinesPanel from '@/components/modules/settings/SettingsDisciplinesPanel';

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

const ACTION_TITLE_KEYS: Record<PermissionAction, string> = {
  view: 'settings.actionView',
  create: 'settings.actionCreate',
  edit: 'settings.actionEdit',
  delete: 'settings.actionDelete',
  approve: 'settings.actionApprove',
  export: 'settings.actionExport',
};

function matrixKey(module: string, action: string): string {
  return `${module}:${action}`;
}

function formatModuleLabel(module: string): string {
  return module.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
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

function countGrantedPermissions(matrix: Record<string, boolean>): number {
  return Object.values(matrix).filter(Boolean).length;
}

function SettingsSummaryCard({
  roleCount,
  moduleCount,
  selectedRole,
  grantedCount,
}: {
  roleCount: number;
  moduleCount: number;
  selectedRole: Role | null;
  grantedCount: number;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <div className={`${layout.cardSurface} overflow-hidden`}>
      <div className="h-1.5 w-full" style={{ backgroundColor: tokens.colorPrimary }} />
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl text-white"
          style={{ backgroundColor: tokens.colorSidebarBg }}
        >
          <SafetyCertificateOutlined />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
            {t('settings.rolesPermissions')}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t('settings.rolesPermissionsDescription')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge
              label={t('settings.roleCount', { count: roleCount })}
              variant="default"
            />
            <StatusBadge
              label={t('settings.moduleCount', { count: moduleCount })}
              variant="default"
            />
            {selectedRole && (
              <StatusBadge
                label={t('settings.permissionsGranted', { count: grantedCount })}
                variant="info"
              />
            )}
          </div>
        </div>

        {selectedRole && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 sm:min-w-[220px]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t('settings.editingRole')}
            </p>
            <p className="mt-1 truncate text-base font-semibold text-slate-900">
              {selectedRole.name}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge
                label={selectedRole.isSystemRole ? t('common.system') : t('common.custom')}
                variant={selectedRole.isSystemRole ? 'info' : 'default'}
              />
              <StatusBadge
                label={selectedRole.isActive ? t('common.active') : t('common.inactive')}
                variant={selectedRole.isActive ? 'success' : 'default'}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RoleList({
  roles,
  selectedRoleId,
  onSelect,
}: {
  roles: Role[];
  selectedRoleId: string | null;
  onSelect: (roleId: string) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  if (roles.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        {t('settings.noRoles')}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {roles.map((role) => {
        const isSelected = role.id === selectedRoleId;

        return (
          <li key={role.id}>
            <button
              type="button"
              onClick={() => onSelect(role.id)}
              className={[
                'w-full rounded-lg border px-4 py-3 text-left transition-colors',
                isSelected
                  ? 'border-orange-200 bg-orange-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
              ].join(' ')}
              style={
                isSelected
                  ? { borderLeftWidth: 4, borderLeftColor: tokens.colorPrimary }
                  : undefined
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className={[
                      'truncate text-sm',
                      isSelected ? 'font-semibold text-slate-900' : 'font-medium text-slate-800',
                    ].join(' ')}
                  >
                    {role.name}
                  </p>
                  {role.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {role.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge
                    label={role.isSystemRole ? t('common.system') : t('common.custom')}
                    variant={role.isSystemRole ? 'info' : 'default'}
                  />
                  <StatusBadge
                    label={role.isActive ? t('common.active') : t('common.inactive')}
                    variant={role.isActive ? 'success' : 'default'}
                  />
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function SettingsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const permLoading = usePermissionsLoading();
  const canEditRoles = useAuthStore((state) => state.capabilities.canEditRoles);
  const rolesEditable = !permLoading && canEditRoles;
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('roles');

  const rolesQuery = useRoles({ page: 1, limit: 100 });
  const permissionsQuery = usePermissions(Boolean(selectedRoleId));
  const roleQuery = useRole(selectedRoleId ?? '', Boolean(selectedRoleId));
  const updatePermissions = useUpdateRolePermissions();

  const catalog = permissionsQuery.data ?? [];
  const modules = useMemo(
    () => [...new Set(catalog.map((permission) => permission.module))].sort(),
    [catalog],
  );

  const roles = rolesQuery.data?.data ?? [];
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;
  const grantedCount = countGrantedPermissions(matrix);

  useEffect(() => {
    if (roles.length > 0 && !selectedRoleId) {
      setSelectedRoleId(roles[0]?.id ?? null);
    }
  }, [roles, selectedRoleId]);

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
      <div className={layout.loadingCard}>
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
          title={t('settings.title')}
          description={t('settings.noPermission')}
        />
      );
    }

    return (
      <PlaceholderPage
        icon={Settings}
        title={t('settings.title')}
        description={t('settings.loadError')}
      />
    );
  }

  function handleSelectRole(roleId: string): void {
    setSelectedRoleId(roleId);
    setSaveError(null);
    setSaveSuccess(null);
  }

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
      setSaveSuccess(t('settings.permissionsSaved'));
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setSaveError(error.message);
      } else {
        setSaveError(t('settings.permissionsSaveError'));
      }
    }
  }

  function permissionFor(module: string, action: string): Permission | undefined {
    return catalog.find(
      (item) => item.module === module && item.action === action,
    );
  }

  return (
    <div className={layout.pageStack}>
      <SettingsSummaryCard
        roleCount={roles.length}
        moduleCount={modules.length}
        selectedRole={selectedRole}
        grantedCount={grantedCount}
      />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'roles',
            label: t('settings.rolesPermissions'),
            children: (
              <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
                <div className="lg:col-span-4">
                  <FormLayout
                    title={t('settings.rolesTitle')}
                    description={t('settings.rolesDescription')}
                  >
                    <RoleList
                      roles={roles}
                      selectedRoleId={selectedRoleId}
                      onSelect={handleSelectRole}
                    />
                  </FormLayout>
                </div>

                <div className="lg:col-span-8">
                  <FormLayout
                    title={
                      selectedRole
                        ? t('settings.permissionsForRole', { name: selectedRole.name })
                        : t('settings.permissionsTitle')
                    }
                    description={
                      selectedRole
                        ? t('settings.permissionsDescription')
                        : t('settings.permissionsSelectRole')
                    }
                    extra={
                      selectedRole && rolesEditable ? (
                        <Button
                          type="primary"
                          onClick={() => void handleSave()}
                          loading={updatePermissions.isPending || roleQuery.isLoading}
                        >
                          {t('settings.savePermissions')}
                        </Button>
                      ) : undefined
                    }
                  >
                    {!selectedRole ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center">
                        <p className="text-sm font-medium text-slate-700">
                          {t('settings.permissionsEmptyTitle')}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {t('settings.permissionsEmptyDescription')}
                        </p>
                      </div>
                    ) : roleQuery.isLoading || permissionsQuery.isLoading ? (
                      <div className="flex justify-center py-12">
                        <Spin />
                      </div>
                    ) : (
                      <DataTable<{ module: string }>
                        rowKey="module"
                        dataSource={modules.map((module) => ({ module }))}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        columns={[
                          {
                            title: t('common.module'),
                            dataIndex: 'module',
                            key: 'module',
                            fixed: 'left',
                            width: 180,
                            render: (module: string) => (
                              <span className="font-medium text-slate-800">
                                {formatModuleLabel(module)}
                              </span>
                            ),
                          },
                          ...ACTIONS.map((action) => ({
                            title: t(ACTION_TITLE_KEYS[action]),
                            key: action,
                            align: 'center' as const,
                            width: 88,
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
                                  disabled={!rolesEditable}
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

                    {!permLoading && !canEditRoles && selectedRole && (
                      <p className="mt-4 text-sm text-slate-500">
                        {t('settings.viewOnlyRoles')}
                      </p>
                    )}

                    {saveError && (
                      <Alert type="error" showIcon title={saveError} className="!mt-4" />
                    )}

                    {saveSuccess && (
                      <Alert type="success" showIcon title={saveSuccess} className="!mt-4" />
                    )}
                  </FormLayout>
                </div>
              </div>
            ),
          },
          {
            key: 'organization',
            label: 'Organization',
            children: (
              <div className="grid gap-6 lg:grid-cols-2">
                <SettingsDepartmentsPanel />
                <SettingsDisciplinesPanel />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
