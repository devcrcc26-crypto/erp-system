'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Spin } from 'antd';
import {
  AppstoreOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import PlaceholderPage from '@/components/PlaceholderPage';
import { Settings } from 'lucide-react';
import { ApiRequestError } from '@/lib/api/errors';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import DataTable from '@/components/ui/DataTable/DataTable';
import KPICard from '@/components/ui/KPICard/KPICard';
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
  return module
    .replace(/_/g, ' ')
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
      <div className="flex flex-col items-center rounded-xl border border-dashed border-[rgba(0,0,0,0.08)] bg-[var(--color-surface-secondary)] px-4 py-10 text-center">
        <div
          className="mb-3 flex h-11 w-11 items-center justify-center rounded-full"
          style={{
            backgroundColor: tokens.colorGray50,
            color: tokens.colorTextTertiary,
          }}
        >
          <TeamOutlined style={{ fontSize: 18 }} />
        </div>
        <p className="m-0 text-sm font-medium text-[var(--color-text-primary)]">
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
                'relative w-full overflow-hidden rounded-xl border px-4 py-3 text-left transition-colors',
                isSelected
                  ? 'border-[rgba(29,158,117,0.25)] bg-[var(--color-teal-50)] shadow-sm'
                  : 'border-[rgba(0,0,0,0.08)] bg-white hover:border-[rgba(0,0,0,0.12)] hover:bg-[var(--color-surface-secondary)]',
              ].join(' ')}
            >
              {isSelected ? (
                <span
                  className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full"
                  style={{ backgroundColor: tokens.colorPrimary }}
                  aria-hidden
                />
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className={[
                      'truncate text-sm',
                      isSelected
                        ? 'font-semibold text-[var(--color-text-primary)]'
                        : 'font-medium text-[var(--color-text-primary)]',
                    ].join(' ')}
                  >
                    {role.name}
                  </p>
                  {role.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--color-text-tertiary)]">
                      {role.description}
                    </p>
                  ) : null}
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
    <div className="flex flex-col gap-4">
      <div
        className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <div className="border-b border-[rgba(0,0,0,0.06)] px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{
                backgroundColor: tokens.colorPrimaryLight,
                color: tokens.colorPrimary,
              }}
            >
              <SafetyCertificateOutlined style={{ fontSize: 18 }} />
            </div>
            <div className="min-w-0">
              <h2
                className="m-0 text-lg font-semibold leading-tight"
                style={{ color: tokens.colorTextPrimary }}
              >
                {t('settings.rolesPermissions')}
              </h2>
              <p
                className="m-0 mt-1 text-sm"
                style={{ color: tokens.colorTextSecondary }}
              >
                {t('settings.rolesPermissionsDescription')}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:p-5">
          <KPICard
            label={t('settings.stats.roles')}
            value={String(roles.length)}
            icon={TeamOutlined}
            iconBg={tokens.colorTeal50}
            iconColor={tokens.colorTeal400}
          />
          <KPICard
            label={t('settings.stats.modules')}
            value={String(modules.length)}
            icon={AppstoreOutlined}
            iconBg={tokens.colorBlue50}
            iconColor={tokens.colorBlue400}
          />
          <KPICard
            label={t('settings.stats.granted')}
            value={selectedRole ? String(grantedCount) : '—'}
            icon={SafetyCertificateOutlined}
            iconBg={tokens.colorAmber50}
            iconColor={tokens.colorAmber400}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="lg:col-span-4">
          <FormLayout
            title={t('settings.rolesTitle')}
            description={t('settings.rolesDescription')}
            variant="pro"
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
            variant="pro"
            extra={
              selectedRole && rolesEditable ? (
                <Button
                  type="primary"
                  onClick={() => void handleSave()}
                  loading={updatePermissions.isPending || roleQuery.isLoading}
                  style={{ backgroundColor: tokens.colorPrimary }}
                >
                  {t('settings.savePermissions')}
                </Button>
              ) : undefined
            }
          >
            {selectedRole ? (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.06)] bg-[var(--color-surface-secondary)] px-3 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  {t('settings.editingRole')}
                </span>
                <StatusBadge
                  label={selectedRole.isSystemRole ? t('common.system') : t('common.custom')}
                  variant={selectedRole.isSystemRole ? 'info' : 'default'}
                />
                <StatusBadge
                  label={selectedRole.isActive ? t('common.active') : t('common.inactive')}
                  variant={selectedRole.isActive ? 'success' : 'default'}
                />
                <StatusBadge
                  label={t('settings.permissionsGranted', { count: grantedCount })}
                  variant="info"
                />
              </div>
            ) : null}

            {!selectedRole ? (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-[rgba(0,0,0,0.08)] bg-[var(--color-surface-secondary)] px-4 py-12 text-center">
                <div
                  className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: tokens.colorGray50,
                    color: tokens.colorTextTertiary,
                  }}
                >
                  <SafetyCertificateOutlined style={{ fontSize: 20 }} />
                </div>
                <p className="m-0 text-sm font-semibold text-[var(--color-text-primary)]">
                  {t('settings.permissionsEmptyTitle')}
                </p>
                <p className="m-0 mt-1 max-w-sm text-sm text-[var(--color-text-secondary)]">
                  {t('settings.permissionsEmptyDescription')}
                </p>
              </div>
            ) : roleQuery.isLoading || permissionsQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <Spin />
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)]">
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
                        <span className="font-medium text-[var(--color-text-primary)]">
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
                          return (
                            <span className="text-[var(--color-text-tertiary)]">
                              —
                            </span>
                          );
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
              </div>
            )}

            {!permLoading && !canEditRoles && selectedRole ? (
              <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
                {t('settings.viewOnlyRoles')}
              </p>
            ) : null}

            {saveError ? (
              <Alert type="error" showIcon title={saveError} className="!mt-4" />
            ) : null}

            {saveSuccess ? (
              <Alert type="success" showIcon title={saveSuccess} className="!mt-4" />
            ) : null}
          </FormLayout>
        </div>
      </div>
    </div>
  );
}
