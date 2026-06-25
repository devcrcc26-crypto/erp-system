'use client';

import { useMemo } from 'react';
import { Select, Spin } from 'antd';
import type { SelectProps } from 'antd';
import { useProjectTeam } from '@/lib/query/projects';
import { useUsersDirectory } from '@/lib/query/users';
import { formatUserPickerLabel } from '@/lib/utils/user-display';

/**
 * User picker limited to active members of the project team.
 */
export default function ProjectTeamUserSelect({
  projectId,
  value,
  onChange,
  placeholder = 'Select team member',
  disabled = false,
  allowClear = true,
  excludeUserIds = [],
  className,
}: {
  projectId: string;
  value?: string;
  onChange?: (userId: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  excludeUserIds?: string[];
  className?: string;
}): React.ReactNode {
  const teamQuery = useProjectTeam(projectId, Boolean(projectId) && !disabled);
  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100, sortBy: 'firstName', sortOrder: 'asc' },
    { enabled: !disabled && Boolean(projectId) },
  );

  const teamUserIds = useMemo(
    () => new Set((teamQuery.data ?? []).map((member) => member.userId)),
    [teamQuery.data],
  );

  const options = useMemo(() => {
    const users = usersQuery.data?.data ?? [];
    return users
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
  }, [usersQuery.data?.data, teamUserIds, excludeUserIds]);

  const handleChange: SelectProps['onChange'] = (nextValue) => {
    onChange?.(typeof nextValue === 'string' ? nextValue : undefined);
  };

  const isLoading = teamQuery.isLoading || usersQuery.isLoading;

  return (
    <Select
      showSearch
      allowClear={allowClear}
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      disabled={disabled || isLoading || teamUserIds.size === 0}
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
        ) : teamUserIds.size === 0 ? (
          'Add members on the project team first'
        ) : (
          'No team members found'
        )
      }
    />
  );
}
