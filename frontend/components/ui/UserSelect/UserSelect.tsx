'use client';

import { useMemo } from 'react';
import { Select, Spin } from 'antd';
import type { SelectProps } from 'antd';
import { useFullUsersDirectory, useUser } from '@/lib/query/users';
import type { User } from '@/lib/api/types';
import { formatUserDiscipline, formatUserName } from '@/lib/utils/user-display';
import { withSelectedUserOption } from '@/lib/utils/user-select-options';

function formatUserLabel(user: User): string {
  return `${formatUserName(user)} (${formatUserDiscipline(user)})`;
}

/**
 * Searchable user picker backed by the users API.
 * Supports single or multiple selection via `mode`.
 */
export default function UserSelect({
  value,
  onChange,
  placeholder = 'Select user',
  disabled = false,
  allowClear = true,
  excludeUserIds = [],
  engineeringDisciplineId,
  className,
  mode,
  activeEmploymentOnly = false,
  approverOnly = false,
}: {
  value?: string | string[];
  onChange?: (userId: string | string[] | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  excludeUserIds?: string[];
  /** When set, only users assigned to this engineering discipline are listed. */
  engineeringDisciplineId?: string;
  className?: string;
  mode?: 'multiple';
  /** Hide inactive (suspended / long leave) and separated employees. */
  activeEmploymentOnly?: boolean;
  /** Only Approver-only employees (excludedFromHrProcesses). */
  approverOnly?: boolean;
}): React.ReactNode {
  const usersQuery = useFullUsersDirectory({
    enabled: !disabled,
  });
  const singleValue = typeof value === 'string' ? value : undefined;
  const valueUserQuery = useUser(singleValue ?? '', Boolean(singleValue) && !mode);

  const options = useMemo(() => {
    const users = usersQuery.data ?? [];
    const baseOptions = users
      .filter(
        (user) =>
          user.isActive &&
          (!activeEmploymentOnly || (user.employmentStatus ?? 'ACTIVE') === 'ACTIVE') &&
          (!approverOnly || user.excludedFromHrProcesses === true) &&
          !excludeUserIds.includes(user.id) &&
          (!engineeringDisciplineId ||
            user.engineeringDisciplineId === engineeringDisciplineId),
      )
      .map((user) => ({
        value: user.id,
        label: formatUserLabel(user),
      }));

    if (mode === 'multiple') {
      return baseOptions;
    }

    return withSelectedUserOption(
      baseOptions,
      singleValue,
      valueUserQuery.data,
      formatUserLabel,
    );
  }, [
    usersQuery.data,
    excludeUserIds,
    engineeringDisciplineId,
    singleValue,
    valueUserQuery.data,
    mode,
    activeEmploymentOnly,
    approverOnly,
  ]);

  const handleChange: SelectProps['onChange'] = (nextValue) => {
    if (mode === 'multiple') {
      onChange?.(Array.isArray(nextValue) ? (nextValue as string[]) : []);
      return;
    }
    onChange?.(typeof nextValue === 'string' ? nextValue : undefined);
  };

  const isLoading =
    usersQuery.isLoading ||
    (Boolean(singleValue) && !mode && valueUserQuery.isLoading);

  return (
    <Select
      mode={mode}
      showSearch
      allowClear={allowClear}
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      disabled={disabled || isLoading}
      loading={isLoading}
      options={options}
      className={className}
      optionFilterProp="label"
      filterOption={(input: string, option?: { label?: unknown }) =>
        String(option?.label ?? '')
          .toLowerCase()
          .includes(input.toLowerCase())
      }
      notFoundContent={
        isLoading ? <Spin size="small" /> : 'No users found'
      }
    />
  );
}
