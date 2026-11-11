'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Grid, Spin } from 'antd';
import {
  AppstoreOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import type { Permission, Role, RolePermissionItem } from '@/lib/api/types';
import {
  usePermissions,
  useRole,
  useRoles,
  useUpdateRolePermissions,
} from '@/lib/query/roles';
import { useAuthStore } from '@/stores/auth.store';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { formatRoleDisplayName } from '@/lib/utils/role-colors';

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

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  blue: { bg: '#E6F1FB', fg: '#378ADD' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
} as const;

function matrixKey(module: string, action: string): string {
  return `${module}:${action}`;
}

const MODULE_DISPLAY_NAMES: Record<string, string> = {
  'hr': 'Human Resources',
  'assets': 'Company Assets',
  'vehicles': 'Company Vehicles',
  'reports': 'Reports & Analytics',
  'engineering_documents': 'Engineering Documents',
  'approvals': 'Approvals',
  'users': 'User Management',
  'projects': 'Projects',
  'schedule': 'Work Schedule',
};

function formatModuleLabel(module: string): string {
  if (MODULE_DISPLAY_NAMES[module]) return MODULE_DISPLAY_NAMES[module];
  return module
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
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

function SettingsStat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: keyof typeof STAT_ACCENT;
  icon: React.ReactNode;
}): React.ReactNode {
  const tint = STAT_ACCENT[accent];
  return (
    <div className="erp-users-stat">
      <span
        className="erp-users-stat-chip"
        style={{ background: tint.bg, color: tint.fg }}
      >
        {icon}
      </span>
      <div className="min-w-0 text-left">
        <p className="erp-users-stat-label">{label}</p>
        <p className="erp-users-stat-value">{value}</p>
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
      <div className="flex flex-col items-center rounded-xl border border-dashed border-[#e8ebef] bg-[#f8f9fb] px-4 py-10 text-center">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#F1EFE8] text-[#9AA4B2]">
          <TeamOutlined style={{ fontSize: 18 }} />
        </span>
        <p className="m-0 text-sm font-medium text-[#1A1A1A]">
          {t('settings.noRoles')}
        </p>
      </div>
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
                'erp-settings-role-btn relative w-full overflow-hidden px-4 py-3 text-left transition-colors',
                isSelected ? 'erp-settings-role-btn--active' : '',
              ].join(' ')}
            >
              {isSelected ? (
                <span className="erp-settings-role-accent" aria-hidden />
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className={[
                      'truncate text-sm',
                      isSelected
                        ? 'font-semibold text-[#1A1A1A]'
                        : 'font-medium text-[#1A1A1A]',
                    ].join(' ')}
                  >
                    {formatRoleDisplayName(role.name)}
                  </p>
                  {role.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-[#6B7280]">
                      {role.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge
                    label={
                      role.isSystemRole ? t('common.system') : t('common.custom')
                    }
                    variant={role.isSystemRole ? 'info' : 'default'}
                  />
                  <StatusBadge
                    label={
                      role.isActive ? t('common.active') : t('common.inactive')
                    }
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

/**
 * Settings - roles & permissions with Users chrome.
 */
export default function SettingsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const permLoading = usePermissionsLoading();
  const canEditRoles = useAuthStore((state) => state.capabilities.canEditRoles);
  const rolesEditable = !permLoading && canEditRoles;
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useSetHeaderExtra(null);

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
    setMatrix(buildMatrixFromRole(catalog, roleQuery.data.rolePermissions));
  }, [roleQuery.data, catalog]);

  if (rolesQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-settings-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  if (rolesQuery.isError) {
    const status =
      rolesQuery.error instanceof ApiRequestError
        ? rolesQuery.error.status
        : 0;

    return (
      <div className="erp-pro-list-page erp-users-page erp-settings-page">
        <ErpNotice
          tone="error"
          title={
            status === 403 || status === 401
              ? t('settings.noPermission')
              : t('settings.loadError')
          }
        />
      </div>
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
    <div className="erp-pro-list-page erp-users-page erp-settings-page">
      <div className="erp-users-stat-bar">
        <SettingsStat
          label={t('settings.stats.roles')}
          value={String(roles.length)}
          accent="teal"
          icon={<TeamOutlined />}
        />
        <SettingsStat
          label={t('settings.stats.modules')}
          value={String(modules.length || '-')}
          accent="blue"
          icon={<AppstoreOutlined />}
        />
        <SettingsStat
          label={t('settings.stats.granted')}
          value={selectedRole ? String(grantedCount) : '-'}
          accent="amber"
          icon={<SafetyCertificateOutlined />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="lg:col-span-4">
          <div className="erp-pro-card">
            <div className="erp-pro-card-toolbar erp-users-toolbar">
              <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
                <h3 className="erp-pro-card-toolbar-title">
                  {t('settings.rolesTitle')}
                </h3>
                <span className="erp-users-count-pill">
                  {roles.length.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="px-4 pb-4 pt-1 sm:px-5">
              <p className="mb-3 mt-0 text-xs text-[#6B7280]">
                {t('settings.rolesDescription')}
              </p>
              <RoleList
                roles={roles}
                selectedRoleId={selectedRoleId}
                onSelect={handleSelectRole}
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="erp-pro-card">
            <div className="erp-pro-card-toolbar erp-users-toolbar">
              <div className="erp-users-toolbar-title min-w-0">
                <h3 className="erp-pro-card-toolbar-title">
                  {selectedRole
                    ? t('settings.permissionsForRole', {
                        name: selectedRole.name,
                      })
                    : t('settings.permissionsTitle')}
                </h3>
              </div>
              <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
                {selectedRole && rolesEditable ? (
                  <Button
                    type="primary"
                    icon={isNarrow ? <SafetyCertificateOutlined /> : undefined}
                    onClick={() => void handleSave()}
                    loading={updatePermissions.isPending || roleQuery.isLoading}
                    aria-label={t('settings.savePermissions')}
                  >
                    {isNarrow ? undefined : t('settings.savePermissions')}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="px-4 pb-4 pt-1 sm:px-5">
              <p className="mb-3 mt-0 text-xs text-[#6B7280]">
                {selectedRole
                  ? t('settings.permissionsDescription')
                  : t('settings.permissionsSelectRole')}
              </p>

              {saveError ? (
                <ErpNotice tone="error" className="mb-4" title={saveError} />
              ) : null}
              {saveSuccess ? (
                <ErpNotice
                  tone="success"
                  className="mb-4"
                  title={saveSuccess}
                />
              ) : null}

              {selectedRole ? (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#e8ebef] bg-[#f8f9fb] px-3 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9AA4B2]">
                    {t('settings.editingRole')}
                  </span>
                  <StatusBadge
                    label={
                      selectedRole.isSystemRole
                        ? t('common.system')
                        : t('common.custom')
                    }
                    variant={selectedRole.isSystemRole ? 'info' : 'default'}
                  />
                  <StatusBadge
                    label={
                      selectedRole.isActive
                        ? t('common.active')
                        : t('common.inactive')
                    }
                    variant={selectedRole.isActive ? 'success' : 'default'}
                  />
                  <StatusBadge
                    label={t('settings.permissionsGranted', {
                      count: grantedCount,
                    })}
                    variant="info"
                  />
                </div>
              ) : null}

              {!selectedRole ? (
                <div className="flex flex-col items-center rounded-xl border border-dashed border-[#e8ebef] bg-[#f8f9fb] px-4 py-12 text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1EFE8] text-[#9AA4B2]">
                    <SafetyCertificateOutlined style={{ fontSize: 20 }} />
                  </span>
                  <p className="m-0 text-sm font-semibold text-[#1A1A1A]">
                    {t('settings.permissionsEmptyTitle')}
                  </p>
                  <p className="m-0 mt-1 max-w-sm text-sm text-[#6B7280]">
                    {t('settings.permissionsEmptyDescription')}
                  </p>
                </div>
              ) : roleQuery.isLoading || permissionsQuery.isLoading ? (
                <div className="flex justify-center py-12">
                  <Spin />
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#e8ebef]">
                  <DataTable<{ module: string }>
                    rowKey="module"
                    className="erp-pro-table erp-users-table"
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
                          <span className="erp-users-cell-strong">
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
                          const permission = permissionFor(
                            record.module,
                            action,
                          );
                          const checked =
                            matrix[matrixKey(record.module, action)] ?? false;

                          if (!permission) {
                            return (
                              <span className="erp-users-cell-sub">-</span>
                            );
                          }

                          return (
                            <Checkbox
                              checked={checked}
                              disabled={!rolesEditable}
                              onChange={(event: {
                                target: { checked: boolean };
                              }) =>
                                handleToggle(
                                  record.module,
                                  action,
                                  event.target.checked,
                                )
                              }
                            />
                          );
                        },
                      })),
                    ]}
                  />
                </div>
              )}

              {!permLoading && !canEditRoles && selectedRole ? (
                <ErpNotice
                  tone="info"
                  className="mt-4"
                  title={t('settings.viewOnlyRoles')}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
