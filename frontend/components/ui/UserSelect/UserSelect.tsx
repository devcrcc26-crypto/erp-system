'use client';

import { useMemo } from 'react';
import { Select, Spin } from 'antd';
import type { SelectProps } from 'antd';
import { useFullUsersDirectory, useUser } from '@/lib/query/users';
import type { User } from '@/lib/api/types';
import { withSelectedUserOption } from '@/lib/utils/user-select-options';

function formatUserLabel(user: User): string {
  const contact = user.email ? ` (${user.email})` : '';
  return `${user.firstName} ${user.lastName}${contact}`;
}

/**
 * Searchable user picker backed by the users API.
 */
export default function UserSelect({
  value,
  onChange,
  placeholder = 'Select user',
  disabled = false,
  allowClear = true,
  excludeUserIds = [],
  className,
}: {
  value?: string;
  onChange?: (userId: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  excludeUserIds?: string[];
  className?: string;
}): React.ReactNode {
  const usersQuery = useFullUsersDirectory({
    enabled: !disabled,
  });
  const valueUserQuery = useUser(value ?? '', Boolean(value) && !disabled);

  const options = useMemo(() => {
    const users = usersQuery.data ?? [];
    const baseOptions = users
      .filter((user) => user.isActive && !excludeUserIds.includes(user.id))
      .map((user) => ({
        value: user.id,
        label: formatUserLabel(user),
      }));

    return withSelectedUserOption(
      baseOptions,
      value,
      valueUserQuery.data,
      formatUserLabel,
    );
  }, [usersQuery.data, excludeUserIds, value, valueUserQuery.data]);

  const handleChange: SelectProps['onChange'] = (nextValue) => {
    onChange?.(typeof nextValue === 'string' ? nextValue : undefined);
  };

  const isLoading =
    usersQuery.isLoading || (Boolean(value) && valueUserQuery.isLoading);

  return (
    <Select
      showSearch
      allowClear={allowClear}
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      disabled={disabled || isLoading}
      loading={isLoading}
      options={options}
      className={className}
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
