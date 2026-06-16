'use client';

import { useMemo } from 'react';
import { Select, Spin } from 'antd';
import type { SelectProps } from 'antd';
import { useUsers } from '@/lib/query/users';
import type { User } from '@/lib/api/types';

function formatUserLabel(user: User): string {
  return `${user.firstName} ${user.lastName} (${user.email})`;
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
  const usersQuery = useUsers(
    { page: 1, limit: 100, sortBy: 'firstName', sortOrder: 'asc' },
    { enabled: !disabled },
  );

  const options = useMemo(() => {
    const users = usersQuery.data?.data ?? [];
    return users
      .filter((user) => user.isActive && !excludeUserIds.includes(user.id))
      .map((user) => ({
        value: user.id,
        label: formatUserLabel(user),
      }));
  }, [usersQuery.data?.data, excludeUserIds]);

  const handleChange: SelectProps['onChange'] = (nextValue) => {
    onChange?.(typeof nextValue === 'string' ? nextValue : undefined);
  };

  return (
    <Select
      showSearch
      allowClear={allowClear}
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      disabled={disabled || usersQuery.isLoading}
      loading={usersQuery.isLoading}
      options={options}
      className={className}
      filterOption={(input: string, option?: { label?: unknown }) =>
        String(option?.label ?? '')
          .toLowerCase()
          .includes(input.toLowerCase())
      }
      notFoundContent={
        usersQuery.isLoading ? <Spin size="small" /> : 'No users found'
      }
    />
  );
}
