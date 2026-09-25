'use client';

import { useMemo, useState } from 'react';
import { Button, Select, Tag, Tooltip } from 'antd';
import { PlusOutlined, CloseOutlined } from '@ant-design/icons';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { UserRoleAssignment } from '@/lib/api/types';
import { useRoles } from '@/lib/query/roles';
import {
  useAssignRole,
  useRevokeRole,
  useSetPrimaryRole,
} from '@/lib/query/users';
import { getRoleColor, formatRoleDisplayName } from '@/lib/utils/role-colors';

export interface EmployeeRolesCardProps {
  employeeId: string;
  roles: UserRoleAssignment[];
  /** When true, show add / set-primary / remove controls. */
  canEdit: boolean;
  onRolesChanged: () => void;
}

/**
 * Lists a user's role assignments with optional primary/add/remove management.
 */
export default function EmployeeRolesCard({
  employeeId,
  roles,
  canEdit,
  onRolesChanged,
}: EmployeeRolesCardProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [adding, setAdding] = useState(false);
  const [pendingRoleId, setPendingRoleId] = useState<string | undefined>();

  const rolesQuery = useRoles(
    { page: 1, limit: 100, sortBy: 'name', sortOrder: 'asc' },
    { enabled: canEdit && adding },
  );
  const assignRole = useAssignRole();
  const revokeRole = useRevokeRole();
  const setPrimaryRole = useSetPrimaryRole();

  const assignedRoleIds = useMemo(
    () => new Set(roles.map((assignment) => assignment.roleId)),
    [roles],
  );

  const availableRoleOptions = useMemo(() => {
    const catalog = rolesQuery.data?.data ?? [];
    return catalog
      .filter((role) => role.isActive !== false && !assignedRoleIds.has(role.id))
      .map((role) => ({
        value: role.id,
        label: formatRoleDisplayName(role.name),
      }));
  }, [assignedRoleIds, rolesQuery.data?.data]);

  const sortedRoles = useMemo(
    () =>
      [...roles].sort((a, b) => {
        if (a.isPrimary === b.isPrimary) {
          return a.role.name.localeCompare(b.role.name);
        }
        return a.isPrimary ? -1 : 1;
      }),
    [roles],
  );

  const busy =
    assignRole.isPending ||
    revokeRole.isPending ||
    setPrimaryRole.isPending;

  async function handleSetPrimary(roleId: string): Promise<void> {
    try {
      await setPrimaryRole.mutateAsync({ userId: employeeId, roleId });
      messageApi.success(t('users.primaryRoleUpdated'));
      onRolesChanged();
    } catch (error: unknown) {
      messageApi.error(
        error instanceof ApiRequestError
          ? error.message
          : t('users.setPrimaryRoleError'),
      );
    }
  }

  async function handleRemove(roleId: string, isPrimary: boolean): Promise<void> {
    if (isPrimary) {
      return;
    }
    if (roles.length <= 1) {
      messageApi.warning(t('users.cannotRemoveLastRole'));
      return;
    }
    try {
      await revokeRole.mutateAsync({ userId: employeeId, roleId });
      messageApi.success(t('users.roleRemoved'));
      onRolesChanged();
    } catch (error: unknown) {
      messageApi.error(
        error instanceof ApiRequestError
          ? error.message
          : t('users.roleRemoveError'),
      );
    }
  }

  async function handleAdd(roleId: string): Promise<void> {
    try {
      await assignRole.mutateAsync({ userId: employeeId, roleId });
      messageApi.success(t('users.roleAdded'));
      setPendingRoleId(undefined);
      setAdding(false);
      onRolesChanged();
    } catch (error: unknown) {
      messageApi.error(
        error instanceof ApiRequestError
          ? error.message
          : t('users.roleAddError'),
      );
    }
  }

  return (
    <div className="erp-employee-roles-card">
      {canEdit ? (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {adding ? null : (
            <Button
              type="default"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setAdding(true)}
              disabled={busy}
            >
              {t('users.addRole')}
            </Button>
          )}
        </div>
      ) : null}

      {canEdit && adding ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={t('users.selectRoleToAdd')}
            className="min-w-[220px] flex-1"
            loading={rolesQuery.isLoading}
            options={availableRoleOptions}
            value={pendingRoleId}
            onChange={(value: string) => {
              setPendingRoleId(value);
              void handleAdd(value);
            }}
            disabled={busy}
            aria-label={t('users.selectRoleToAdd')}
          />
          <Button
            size="small"
            onClick={() => {
              setAdding(false);
              setPendingRoleId(undefined);
            }}
            disabled={busy}
          >
            {t('common.cancel')}
          </Button>
        </div>
      ) : null}

      {sortedRoles.length === 0 ? (
        <p className="erp-users-cell-sub m-0">{t('users.noRoleAssigned')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {sortedRoles.map((assignment) => {
            const isPrimary = Boolean(assignment.isPrimary);
            const removeDisabled = isPrimary || roles.length <= 1 || busy;
            const removeTooltip = isPrimary
              ? t('users.cannotRemovePrimaryRole')
              : roles.length <= 1
                ? t('users.cannotRemoveLastRole')
                : t('users.removeRole');

            return (
              <li
                key={assignment.id}
                className="erp-employee-role-row flex flex-wrap items-center gap-2 rounded-md border border-[var(--border-color,#E5E7EB)] px-3 py-2"
              >
                <span
                  className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                    isPrimary
                      ? 'bg-[var(--color-primary,#F47B20)]'
                      : 'border-2 border-[var(--color-primary,#F47B20)] bg-transparent'
                  }`}
                  aria-hidden
                />
                <Tag
                  color={getRoleColor(assignment.role.name)}
                  className="m-0"
                  style={{ fontWeight: isPrimary ? 600 : 400 }}
                >
                  {formatRoleDisplayName(assignment.role.name)}
                </Tag>
                {isPrimary ? (
                  <Tag color="success" className="m-0">
                    {t('users.primaryRole')}
                  </Tag>
                ) : null}
                <div className="ml-auto flex flex-wrap items-center gap-1">
                  {canEdit && !isPrimary ? (
                    <Button
                      type="link"
                      size="small"
                      className="px-1"
                      disabled={busy}
                      onClick={() => void handleSetPrimary(assignment.roleId)}
                    >
                      {t('users.setAsPrimary')}
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Tooltip title={removeTooltip}>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<CloseOutlined />}
                        disabled={removeDisabled}
                        aria-label={t('users.removeRole')}
                        onClick={() =>
                          void handleRemove(assignment.roleId, isPrimary)
                        }
                      />
                    </Tooltip>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
