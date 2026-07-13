'use client';

import { useMemo } from 'react';
import { Select, Spin } from 'antd';
import type { SelectProps } from 'antd';
import { useProjectTeam } from '@/lib/query/projects';
import { useFullUsersDirectory, useUser } from '@/lib/query/users';
import {
  formatUserPickerLabel,
} from '@/lib/utils/user-display';
import { withSelectedUserOption } from '@/lib/utils/user-select-options';

/**
 * User picker limited to active members of the project team by default.
 * Use `memberScope="company_active"` for role assignment when assignees may
 * not yet be on the project team roster (e.g. discipline leaders picking designers).
 */
export default function ProjectTeamUserSelect({
  projectId,
  value,
  onChange,
  placeholder = 'Select team member',
  disabled = false,
  allowClear = true,
  excludeUserIds = [],
  restrictToUserIds,
  memberScope = 'project_team',
  className,
}: {
  projectId: string;
  value?: string;
  onChange?: (userId: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  excludeUserIds?: string[];
  restrictToUserIds?: readonly string[];
  memberScope?: 'project_team' | 'company_active';
  className?: string;
}): React.ReactNode {
  const useCompanyDirectory = memberScope === 'company_active';
  const isRestricted = Boolean(restrictToUserIds && restrictToUserIds.length > 0);
  const teamQuery = useProjectTeam(
    projectId,
    Boolean(projectId) && !disabled && !isRestricted && !useCompanyDirectory,
  );
  const usersQuery = useFullUsersDirectory({
    enabled: !disabled && Boolean(projectId),
  });
  const valueUserQuery = useUser(value ?? '', Boolean(value) && !disabled);

  const teamUserIds = useMemo(
    () => new Set((teamQuery.data ?? []).map((member) => member.userId)),
    [teamQuery.data],
  );

  const teamNameByUserId = useMemo(
    () =>
      new Map(
        (teamQuery.data ?? [])
          .filter((member) => member.userName)
          .map((member) => [member.userId, member.userName as string]),
      ),
    [teamQuery.data],
  );

  const options = useMemo(() => {
    const users = usersQuery.data ?? [];

    if (restrictToUserIds && restrictToUserIds.length > 0) {
      const baseOptions = users
        .filter((user) => user.isActive && restrictToUserIds.includes(user.id))
        .map((user) => ({
          value: user.id,
          label: formatUserPickerLabel(user),
        }));

      return withSelectedUserOption(
        baseOptions,
        value,
        valueUserQuery.data,
        formatUserPickerLabel,
        undefined,
      );
    }

    if (useCompanyDirectory) {
      const baseOptions = users
        .filter(
          (user) => user.isActive && !excludeUserIds.includes(user.id),
        )
        .map((user) => ({
          value: user.id,
          label: formatUserPickerLabel(user),
        }));

      return withSelectedUserOption(
        baseOptions,
        value,
        valueUserQuery.data,
        formatUserPickerLabel,
        undefined,
      );
    }

    const baseOptions = users
      .filter(
        (user) =>
          user.isActive &&
          teamUserIds.has(user.id) &&
          !excludeUserIds.includes(user.id),
      )
      .map((user) => ({
        value: user.id,
        label: formatUserPickerLabel(user),
      }));

    for (const [userId, userName] of teamNameByUserId) {
      if (
        teamUserIds.has(userId) &&
        !excludeUserIds.includes(userId) &&
        !baseOptions.some((option) => option.value === userId)
      ) {
        baseOptions.push({ value: userId, label: userName });
      }
    }

    return withSelectedUserOption(
      baseOptions,
      value,
      valueUserQuery.data,
      formatUserPickerLabel,
      value ? teamNameByUserId.get(value) : undefined,
    );
  }, [
    usersQuery.data,
    teamUserIds,
    teamNameByUserId,
    excludeUserIds,
    restrictToUserIds,
    useCompanyDirectory,
    value,
    valueUserQuery.data,
  ]);

  const handleChange: SelectProps['onChange'] = (nextValue) => {
    onChange?.(typeof nextValue === 'string' ? nextValue : undefined);
  };

  const teamEmpty = !useCompanyDirectory && !isRestricted && teamUserIds.size === 0;

  const isLoading =
    (!useCompanyDirectory && !isRestricted && teamQuery.isLoading) ||
    usersQuery.isLoading ||
    (Boolean(value) && valueUserQuery.isLoading);

  return (
    <Select
      showSearch
      allowClear={allowClear}
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      disabled={disabled || isLoading || teamEmpty}
      loading={isLoading}
      options={options}
      className={className}
      filterOption={(input: string, option?: { label?: unknown }) =>
        String(option?.label ?? '')
          .toLowerCase()
          .includes(input.toLowerCase())
      }
      notFoundContent={
        isLoading ? (
          <Spin size="small" />
        ) : teamEmpty ? (
          'Add members on the project team first'
        ) : (
          'No matching users found'
        )
      }
    />
  );
}
