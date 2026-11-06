'use client';

import { Button, Select, Tag, Tooltip } from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { formatRoleDisplayName } from '@/lib/utils/role-colors';

export interface RoleAssignment {
  roleId: string;
  roleName: string;
  isPrimary: boolean;
}

export interface RoleAssignmentFieldProps {
  value?: RoleAssignment[];
  onChange?: (roles: RoleAssignment[]) => void;
  availableRoles: Array<{ id: string; name: string }>;
  disabled?: boolean;
  loading?: boolean;
}

/**
 * Multi-role picker with exactly one primary assignment.
 */
export default function RoleAssignmentField({
  value = [],
  onChange,
  availableRoles,
  disabled = false,
  loading = false,
}: RoleAssignmentFieldProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const selectedRoleIds = new Set(value.map((assignment) => assignment.roleId));

  function emit(next: RoleAssignment[]): void {
    onChange?.(next);
  }

  function handleAddRole(): void {
    const firstAvailable = availableRoles.find(
      (role) => !selectedRoleIds.has(role.id),
    );
    if (!firstAvailable) {
      return;
    }
    emit([
      ...value,
      {
        roleId: firstAvailable.id,
        roleName: firstAvailable.name,
        isPrimary: value.length === 0,
      },
    ]);
  }

  function handleRoleChange(index: number, roleId: string): void {
    const role = availableRoles.find((item) => item.id === roleId);
    if (!role) {
      return;
    }
    const updated = [...value];
    updated[index] = {
      ...updated[index],
      roleId,
      roleName: role.name,
    };
    emit(updated);
  }

  function handleSetPrimary(index: number): void {
    emit(value.map((assignment, i) => ({ ...assignment, isPrimary: i === index })));
  }

  function handleRemove(index: number): void {
    const removed = value[index];
    if (!removed || value.length <= 1 || removed.isPrimary) {
      return;
    }
    emit(value.filter((_, i) => i !== index));
  }

  return (
    <div className="erp-role-assignment-field flex flex-col gap-2">
      {value.map((assignment, index) => {
        const availableForThisRow = availableRoles.filter(
          (role) =>
            role.id === assignment.roleId || !selectedRoleIds.has(role.id),
        );
        const removeDisabled =
          disabled || value.length === 1 || assignment.isPrimary;

        return (
          <div
            key={`${assignment.roleId}-${index}`}
            className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap"
          >
            <Select
              showSearch
              optionFilterProp="label"
              value={assignment.roleId || undefined}
              onChange={(roleId: string) => handleRoleChange(index, roleId)}
              options={availableForThisRow.map((role) => ({
                value: role.id,
                label: formatRoleDisplayName(role.name),
              }))}
              className="min-w-0 flex-1 basis-full sm:basis-0"
              disabled={disabled}
              loading={loading}
              aria-label={t('users.form.role')}
            />
            {assignment.isPrimary ? (
              <Tag color="success" style={{ margin: 0 }}>
                ★ {t('users.primaryRole')}
              </Tag>
            ) : (
              <Button
                size="small"
                type="text"
                disabled={disabled}
                onClick={() => handleSetPrimary(index)}
              >
                {t('users.setAsPrimary')}
              </Button>
            )}
            <Tooltip
              title={
                assignment.isPrimary
                  ? t('users.cannotRemovePrimaryRole')
                  : value.length === 1
                    ? t('users.cannotRemoveLastRole')
                    : t('users.removeRole')
              }
            >
              <Button
                size="small"
                type="text"
                danger
                icon={<CloseOutlined />}
                disabled={removeDisabled}
                aria-label={t('users.removeRole')}
                onClick={() => handleRemove(index)}
              />
            </Tooltip>
          </div>
        );
      })}
      <Button
        type="dashed"
        size="small"
        icon={<PlusOutlined />}
        onClick={handleAddRole}
        disabled={
          disabled ||
          loading ||
          availableRoles.length === 0 ||
          value.length >= availableRoles.length
        }
        className="!self-start"
      >
        {t('users.addAnotherRole')}
      </Button>
    </div>
  );
}
