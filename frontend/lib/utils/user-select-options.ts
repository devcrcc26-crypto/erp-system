import type { User } from '@/lib/api/types';
import { displayUserLabel } from '@/lib/utils/user-display';

export interface UserSelectOption {
  value: string;
  label: string;
}

/**
 * Ensures the currently selected user appears in select options with a readable label.
 */
export function withSelectedUserOption(
  options: UserSelectOption[],
  value: string | undefined,
  resolvedUser: User | null | undefined,
  formatLabel: (user: User) => string,
  fallbackLabel?: string | null,
): UserSelectOption[] {
  if (!value || options.some((option) => option.value === value)) {
    return options;
  }

  if (resolvedUser) {
    return [
      ...options,
      { value: resolvedUser.id, label: formatLabel(resolvedUser) },
    ];
  }

  const label = fallbackLabel?.trim() || displayUserLabel(value);
  return [...options, { value, label }];
}
